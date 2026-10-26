local DbHandler = require("vettedrent-server.src.db_handler")
local ContractRouter = require("vettedrent-server.src.contract_router")
local WebhookListener = require("vettedrent-server.src.webhook_listener")
local EscrowEngine = require("vettedrent-server.src.escrow_engine")
local RecoveryEngine = require("vettedrent-server.src.reconnection_recovery")
local LockApi = require("vettedrent-server.src.smart_lock_api")
local CronMonitor = require("vettedrent-server.src.cron_remediation_monitor")
local TaxLocalizer = require("vettedrent-server.src.maryland_tax_localizer") -- Hook Tax Engine

local ApiDispatcher = {}

-- Main gateway endpoint Router matrix
function ApiDispatcher.RouteIncomingRequest(endpointPath, requestPayload)
    local db = DbHandler.LoadDatabase()
    if not db then return { status = 500, message = "Database I/O load failure." } end

    print(string.format("\n[ROUTER] Inbound request received at route: %s", endpointPath))

    -- ROUTE 1: Front-end Checkout Submission
    if endpointPath == "/api/checkout/book" then
        -- 1. Determine Track & Contract Type
        local resolution = ContractRouter.ProcessCheckout(requestPayload, db.active_bookings_table)
        
        -- 2. Calculate localized taxes and insurance claim lines
        local taxAndInvoiceSummary = TaxLocalizer.CalculateFinancialSummary({
            stayDurationDays = requestPayload.stayDurationDays,
            ratePerDay = resolution.ratePerDay,
            marylandCounty = requestPayload.marylandCounty,
            whoIsStaying = requestPayload.whoIsStaying,
            insuranceCarrier = requestPayload.insuranceCarrier,
            policyClaimNumber = requestPayload.policyClaimNumber
        })
        
        -- 3. Attach complete itemized invoice to database entry
        resolution.invoice = taxAndInvoiceSummary
        db.active_bookings_table[resolution.bookingId] = resolution
        
        -- Insert tracking event inside the ledger
        table.insert(db.transaction_audit_logs, {
            timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ"),
            booking_id = resolution.bookingId,
            event = "CHECKOUT_PROCESSED_VIA_API",
            details = "Assigned legal track: " .. resolution.legalTrack
        })
        
        DbHandler.SaveDatabase(db)
        return { status = 200, data = resolution }

    -- ROUTE 2: Automated Payment & Banking Webhook Ingestion
    elseif endpointPath == "/api/webhooks/banking" then
        local actionResult = WebhookListener.HandleBankingAlert(requestPayload, db.active_bookings_table)
        
        if actionResult.success then
            db.active_bookings_table[requestPayload.data.bookingId].cryptographic_token_status = actionResult.updatedStatus
            
            -- If corporate track falls into remediation, deploy GMF Escrow instantly
            if actionResult.triggerEscrow then
                local payoutSuccess, updatedDb = EscrowEngine.DisburseHostIndemnity(requestPayload.data.bookingId, db)
                if payoutSuccess then db = updatedDb end
            end
            
            DbHandler.SaveDatabase(db)
            return { status = 200, message = "Webhook event compiled.", state = actionResult.updatedStatus }
        end
        return { status = 400, message = actionResult.message or "Event signature skipped." }

    -- ROUTE 3: Account Reconnection Link Success Trigger
    elseif endpointPath == "/api/recovery/reconnect" then
        local recoverySuccess, recoveredDb = RecoveryEngine.HandleReconnection(requestPayload.bookingId, db)
        if recoverySuccess then
            DbHandler.SaveDatabase(recoveredDb)
            return { status = 200, message = "Access token successfully restored." }
        end
        return { status = 400, message = "Booking ineligible for state recovery." }

    -- ROUTE 4: Cron Hourly System Housekeeping Clock Sweep
    elseif endpointPath == "/api/cron/sweep" then
        local stateAltered, updatedDbState = CronMonitor.ScanAndEnforceTimeouts(db)
        if stateAltered then
            -- If a booking drops to revoked, construct the hardware payload instantly
            for bookingId, booking in pairs(updatedDbState.active_bookings_table) do
                if booking.cryptographic_token_status == "revoked" then
                    LockApi.ExecutePhysicalLockout(bookingId, updatedDbState)
                end
            end
            DbHandler.SaveDatabase(updatedDbState)
        end
        return { status = 200, message = "System clock monitor cycle completed." }
    end

    return { status = 404, message = "Target API endpoint resource not found." }
end

return ApiDispatcher
