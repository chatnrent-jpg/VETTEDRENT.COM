local Config = require("vettedrent-server.src.config")
local WebhookListener = {}

function WebhookListener.HandleBankingAlert(eventPayload, activeBookings)
    local eventType = eventPayload.type
    local bookingId = eventPayload.data.bookingId

    local targetBooking = activeBookings[bookingId]
    if not targetBooking then 
        return { success = false, message = "Record identifier mismatch." } 
    end

    if eventType == "payroll.split.failed" or eventType == "bank.link.disconnected" then
        local legalTrack = targetBooking.legalTrack or targetBooking.legal_track
        if legalTrack == "corporate_shield" then
            -- Move token configuration state to remediation
            targetBooking.cryptographicTokenStatus = "remediation"
            targetBooking.cryptographic_token_status = "remediation"
            return { success = true, updatedStatus = "remediation", triggerEscrow = true }
        else
            -- Immediate token wipe for transient occupants
            targetBooking.cryptographicTokenStatus = "revoked"
            targetBooking.cryptographic_token_status = "revoked"
            return { success = true, updatedStatus = "revoked", triggerEscrow = false }
        end
    end

    return { success = false, message = "Event signature unmapped." }
end

return WebhookListener
