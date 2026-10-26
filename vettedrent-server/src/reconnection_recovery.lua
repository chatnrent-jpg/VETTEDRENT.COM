local ReconnectionRecovery = {}

function ReconnectionRecovery.HandleReconnection(bookingId, databaseState)
    local booking = databaseState.active_bookings_table[bookingId]
    if not booking then return false, "Booking not found" end

    -- Verify the booking is currently in remediation state
    if booking.cryptographic_token_status == "remediation" then
        booking.cryptographic_token_status = "active"
        booking.financial_remediation_window_hours = 24 -- Reset the safety fuse

        -- Log the recovery state mutation
        table.insert(databaseState.transaction_audit_logs, {
            timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ"),
            booking_id = bookingId,
            event = "BANK_LINK_RECOVERY_SUCCESS",
            details = "Guest successfully re-linked bank account within the window. Access token restored to fully active state. GMF escrow protection paused."
        })

        print(string.format("[RECOVERY SUCCESS] Booking %s successfully restored to active compliance. Access key preserved.", bookingId))
        return true, databaseState
    end

    return false, "Booking is not in an adjustable remediation state."
end

return ReconnectionRecovery
