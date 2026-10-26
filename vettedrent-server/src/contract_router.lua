local Config = require("vettedrent-server.src.config")
local FraudPrevention = require("vettedrent-server.src.fraud_prevention")
local ContractRouter = {}

function ContractRouter.ProcessCheckout(bookingPayload, activeBookingsTable)
    local stayDuration = bookingPayload.stayDurationDays
    local tier = bookingPayload.spaceTier or "RoomSanctuary"
    local guestEmail = bookingPayload.emailAddress
    
    local decision = {
        bookingId = bookingPayload.bookingId,
        guestName = bookingPayload.legalFullName,
        email = guestEmail,
        stayDurationDays = stayDuration,
        spaceTier = tier,
        ratePerDay = Config.SPACE_TIERS[tier] or 45,
        totalCost = (Config.SPACE_TIERS[tier] or 45) * stayDuration
    }

    -- Step 1: Query the Fraud Prevention Engine for stacked back-to-back records
    local fraudEvaluation = FraudPrevention.AnalyzeBookingHistory(guestEmail, stayDuration, activeBookingsTable)

    -- Step 2: Dual-Track Forking Evaluator with Loophole Override Override
    if stayDuration < Config.TRACK_THRESHOLD_DAYS and not fraudEvaluation.isLoopholeDetected then
        -- Track A: Standard Transient Guest Track
        decision.legalTrack = "transient"
        decision.contractTitle = "Transient Guest Occupancy License"
        decision.escrowGmfBacked = false
        decision.cryptographicTokenStatus = "active"
    else
        -- Track B: Corporate Shielded Track (Triggered by standard length OR forced conversion)
        decision.legalTrack = "corporate_shield"
        decision.contractTitle = "Corporate Housing Operational Occupancy License"
        decision.escrowGmfBacked = true
        decision.cryptographicTokenStatus = "active"
        
        if fraudEvaluation.isLoopholeDetected then
            decision.audit_override_note = "Track B compliance forced due to consecutive transient stay stacking thresholds."
        end
    end

    return decision
end

return ContractRouter
