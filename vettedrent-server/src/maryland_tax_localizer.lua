local MarylandTaxLocalizer = {}

-- Comprehensive County Transient Occupancy Tax Matrix across Maryland Jurisdictions
local COUNTY_TAX_RATES = {
    ["Baltimore City"] = 0.095,
    ["Montgomery"]     = 0.070,
    ["Prince George's"]= 0.070,
    ["Baltimore County"]= 0.080,
    ["Anne Arundel"]   = 0.070,
    ["Frederick"]      = 0.050,
    ["Howard"]         = 0.070,
    -- Default fallback rate for other Maryland rural counties
    ["Default_Rural"]  = 0.050 
}

function MarylandTaxLocalizer.CalculateFinancialSummary(bookingPayload)
    local stayDuration = bookingPayload.stayDurationDays
    local baseDailyRate = bookingPayload.ratePerDay or 45
    local subtotal = baseDailyRate * stayDuration
    
    local summary = {
        subtotalUsd = subtotal,
        stateSalesTaxUsd = 0.00,
        countyOccupancyTaxUsd = 0.00,
        finalTotalUsd = subtotal,
        aleBillingAuthorized = false
    }

    -- 1. Apply Transient Tax Logic (< 30 days)
    if stayDuration < 30 then
        local county = bookingPayload.marylandCounty or "Default_Rural"
        local countyRate = COUNTY_TAX_RATES[county] or COUNTY_TAX_RATES["Default_Rural"]
        
        summary.stateSalesTaxUsd = subtotal * 0.06 -- Fixed 6% Maryland Sales Tax
        summary.countyOccupancyTaxUsd = subtotal * countyRate
        summary.finalTotalUsd = subtotal + summary.stateSalesTaxUsd + summary.countyOccupancyTaxUsd
    end

    -- 2. Process Insurance ALE Direct Billing Authorization
    if bookingPayload.whoIsStaying == "Family in Transition / Insurance (ALE)" and stayDuration >= 30 then
        summary.aleBillingAuthorized = true
        summary.insuranceCarrier = bookingPayload.insuranceCarrier or "Unassigned Carrier"
        summary.claimNumber = bookingPayload.policyClaimNumber or "Pending Verification"
    end

    return summary
end

return MarylandTaxLocalizer
