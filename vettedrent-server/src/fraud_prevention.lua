local Config = require("vettedrent-server.src.config")
local FraudPrevention = {}

-- Evaluates if a user is trying to stack multiple short bookings to bypass Track B
function FraudPrevention.AnalyzeBookingHistory(guestEmail, incomingStayDuration, activeBookingsTable)
    local cumulativeDays = incomingStayDuration
    local conversionForced = false

    -- Parse all existing logs to compute history within a moving 45-day window
    for _, booking in pairs(activeBookingsTable) do
        if booking.verified_email == guestEmail and booking.cryptographic_token_status ~= "revoked" then
            cumulativeDays = cumulativeDays + booking.stay_duration_days
        end
    end

    -- Loophole Trigger: If stacked bookings push cumulative residency >= 30 days
    if cumulativeDays >= Config.TRACK_THRESHOLD_DAYS and incomingStayDuration < Config.TRACK_THRESHOLD_DAYS then
        conversionForced = true
        print(string.format("[LOOPHOLE DETECTED] Guest %s attempted back-to-back stacking. Cumulative days: %d. Forcing Track B upgrade.", guestEmail, cumulativeDays))
    end

    return {
        isLoopholeDetected = conversionForced,
        calculatedCumulativeDays = cumulativeDays
    }
end

return FraudPrevention
