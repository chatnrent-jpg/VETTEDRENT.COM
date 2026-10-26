local Config = require("vettedrent-server.src.config")
local EscrowEngine = {}

-- Automatically disburses daily funds from GMF pool to landlord during a remediation loop
function EscrowEngine.DisburseHostIndemnity(bookingId, databaseState)
    local booking = databaseState.active_bookings_table[bookingId]
    if not booking then return false, "Booking not found" end

    -- Verify that the booking qualifies for GMF indemnity backing
    if not booking.escrow_gmf_backed or booking.cryptographic_token_status ~= "remediation" then
        return false, "Ineligible track or status state for GMF disbursement"
    end

    -- Compute pro-rated daily payout rate based on space tier metrics
    local baseDailyRate = Config.SPACE_TIERS[booking.space_tier] or 45
    
    -- Mutate the global platform escrow pool balance
    databaseState.platform_meta.gmf_escrow_pool_balance_usd = 
        databaseState.platform_meta.gmf_escrow_pool_balance_usd - baseDailyRate

    -- Log transaction settlement directly inside the ledger array
    table.insert(databaseState.transaction_audit_logs, {
        timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ"),
        booking_id = bookingId,
        event = "GMF_ESCROW_DISBURSEMENT_SETTLED",
        details = string.format("Disbursed daily host indemnity payout of $%d.00 for tier [%s]. New GMF Pool Balance: $%d.00", 
            baseDailyRate, booking.space_tier, databaseState.platform_meta.gmf_escrow_pool_balance_usd)
    })

    print(string.format("[GMF DISBURSEMENT] Successfully transferred $%d.00 to host for booking %s. Landlord cash flow protected.", baseDailyRate, bookingId))
    return true, databaseState
end

return EscrowEngine
