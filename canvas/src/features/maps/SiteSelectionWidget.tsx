import React, { useState } from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { PanelField, PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'

export default function SiteSelectionWidget() {
  const [isExpanded, setIsExpanded] = useState(true)
  const [scenario, setScenario] = useState('baseline')

  const [candidates, setCandidates] = useState([
    {
      id: '1',
      label: 'Candidate A',
      lat: 1.283,
      lng: 103.852,
      baseRent: 15000,
      size: 1200,
      dailyCustomers: 100,
      averageSpend: 25,
      leaseTermMonths: 36,
      initialInvestment: 50000,
      fixedOperatingCosts: 8000,
      grossMargin: 0.7
    },
  ])

  const [dcfResult, setDcfResult] = useState<any>(null)

  const handleRunDCF = () => {
    const SCENARIOS: Record<string, { rev: number, cost: number }> = {
      'baseline': { rev: 1.0, cost: 1.0 },
      'downside': { rev: 0.90, cost: 1.05 },
      'severe': { rev: 0.75, cost: 1.10 }
    }

    const { rev, cost } = SCENARIOS[scenario]

    const results = candidates.map(c => {
      let cumulativeCashFlow = -c.initialInvestment;
      const cashFlows = [-c.initialInvestment];
      
      const annualDiscountRate = 0.10;
      const monthlyRate = Math.pow(1 + annualDiscountRate, 1 / 12) - 1;

      let npv = -c.initialInvestment;

      for (let month = 1; month <= c.leaseTermMonths; month++) {
        const grossRevenue = c.dailyCustomers * 30 * c.averageSpend * rev;
        const grossProfit = grossRevenue * c.grossMargin;
        const occupancyCost = c.baseRent * cost;
        const operatingCost = c.fixedOperatingCosts * cost;

        const netCashFlow = grossProfit - occupancyCost - operatingCost;
        cashFlows.push(netCashFlow);
        
        cumulativeCashFlow += netCashFlow;
        npv += netCashFlow / Math.pow(1 + monthlyRate, month);
      }

      return {
        ...c,
        npv,
        totalNetCashFlow: cumulativeCashFlow
      }
    })

    setDcfResult(results)
  }

  const addCandidate = () => {
    setCandidates([
      ...candidates,
      {
        id: Date.now().toString(),
        label: `Candidate ${String.fromCharCode(65 + candidates.length)}`,
        lat: 1.283,
        lng: 103.852,
        baseRent: 15000,
        size: 1200,
        dailyCustomers: 100,
        averageSpend: 25,
        leaseTermMonths: 36,
        initialInvestment: 50000,
        fixedOperatingCosts: 8000,
        grossMargin: 0.7
      }
    ])
  }

  const updateCandidate = (id: string, field: string, value: string | number) => {
    setCandidates(candidates.map(c => c.id === id ? { ...c, [field]: Number(value) || value } : c))
  }

  return (
    <CollapsibleSection
      title="Site Selection & DCF (MVP)"
      collapsed={!isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
      className={`border-b ${UI_THEME_TOKENS.panel.border}`}
      flushTop={true}
    >
      <section className={`p-2 space-y-4 ${UI_THEME_TOKENS.text.primary} text-xs`}>
        {/* Candidate Sites & Lease Inputs */}
        <section className={`p-2 rounded border ${UI_THEME_TOKENS.panel.border} bg-white/5`}>
          <h3 className="font-semibold mb-2">1. Candidates & Structured Inputs</h3>
          {candidates.map((c, i) => (
            <fieldset
              key={c.id}
              className={`grid grid-cols-2 gap-2 mb-2 pb-2 ${i !== candidates.length - 1 ? 'border-b border-white/10' : ''}`}
            >
              <legend className="sr-only">{`Candidate ${c.label || i + 1}`}</legend>
              <PanelField label="Label" layout="compact" labelClassName="text-xs opacity-70">
                <PanelTextInput
                  variant="transparent"
                  type="text"
                  value={c.label}
                  onChange={e => updateCandidate(c.id, 'label', e.target.value)}
                  className="px-1 text-xs"
                />
              </PanelField>
              <PanelField label="Base Rent ($/mo)" layout="compact" labelClassName="text-xs opacity-70">
                <PanelTextInput
                  variant="transparent"
                  type="number"
                  value={c.baseRent}
                  onChange={e => updateCandidate(c.id, 'baseRent', e.target.value)}
                  className="px-1 text-xs"
                />
              </PanelField>
              <PanelField label="Daily Customers" layout="compact" labelClassName="text-xs opacity-70">
                <PanelTextInput
                  variant="transparent"
                  type="number"
                  value={c.dailyCustomers}
                  onChange={e => updateCandidate(c.id, 'dailyCustomers', e.target.value)}
                  className="px-1 text-xs"
                />
              </PanelField>
              <PanelField label="Avg Spend ($)" layout="compact" labelClassName="text-xs opacity-70">
                <PanelTextInput
                  variant="transparent"
                  type="number"
                  value={c.averageSpend}
                  onChange={e => updateCandidate(c.id, 'averageSpend', e.target.value)}
                  className="px-1 text-xs"
                />
              </PanelField>
              <PanelField label="Initial Invest ($)" layout="compact" labelClassName="text-xs opacity-70">
                <PanelTextInput
                  variant="transparent"
                  type="number"
                  value={c.initialInvestment}
                  onChange={e => updateCandidate(c.id, 'initialInvestment', e.target.value)}
                  className="px-1 text-xs"
                />
              </PanelField>
              <PanelField label="Lease (Months)" layout="compact" labelClassName="text-xs opacity-70">
                <PanelTextInput
                  variant="transparent"
                  type="number"
                  value={c.leaseTermMonths}
                  onChange={e => updateCandidate(c.id, 'leaseTermMonths', e.target.value)}
                  className="px-1 text-xs"
                />
              </PanelField>
            </fieldset>
          ))}
          <button onClick={addCandidate} className={`mt-1 w-full px-2 py-1 rounded border ${UI_THEME_TOKENS.panel.border} hover:bg-white/10`}>
            + Add Candidate Site
          </button>
        </section>

        {/* Space-Photo Analysis */}
        <section className={`p-2 rounded border ${UI_THEME_TOKENS.panel.border} bg-white/5`}>
          <h3 className="font-semibold mb-2">2. Space-Photo Analysis</h3>
          <input type="file" accept="image/*" className="w-full text-xs" />
          <p className="text-xs opacity-70 mt-1">Upload blueprint or shopfront for visual extraction</p>
        </section>

        {/* Address Verification & Nearby Places */}
        <section className={`p-2 rounded border ${UI_THEME_TOKENS.panel.border} bg-white/5`}>
          <h3 className="font-semibold mb-2">3. Nearby Places (GrabMaps)</h3>
          <button className={`w-full px-2 py-1 rounded border ${UI_THEME_TOKENS.panel.border} hover:bg-white/10`}>
            Discover POIs near Candidates
          </button>
        </section>

        {/* DCF Analysis & Stress Testing */}
        <section className={`p-2 rounded border ${UI_THEME_TOKENS.panel.border} bg-white/5`}>
          <h3 className="font-semibold mb-2">4. Economics & Stress Testing</h3>
          <PanelField
            label="Stress Scenario"
            layout="compact"
            className="mb-2"
            labelClassName="whitespace-nowrap text-xs"
          >
            <PanelSelect
              variant="transparent"
              value={scenario}
              onValueChange={selectedValueInput => setScenario(selectedValueInput)}
              className="flex-1 min-w-0 px-1 text-xs"
            >
              <option value="baseline">Baseline</option>
              <option value="downside">Downside (-10% Rev, +5% Cost)</option>
              <option value="severe">Severe (-25% Rev, +10% Cost)</option>
            </PanelSelect>
          </PanelField>
          <button 
            onClick={handleRunDCF}
            className={`w-full px-2 py-2 mt-2 rounded border ${UI_THEME_TOKENS.panel.border} hover:bg-white/10 font-semibold bg-white/5`}
          >
            Run DCF Analysis
          </button>

          {dcfResult && (
            <div className="mt-4 space-y-2 border-t border-white/10 pt-2">
              <h4 className="font-semibold">Candidate Site Comparison</h4>
              {dcfResult.map((res: any) => (
                <div key={res.id} className={`flex flex-col gap-1 p-2 rounded bg-black/20 border ${res.npv > 0 ? 'border-green-500/30' : 'border-red-500/30'}`}>
                  <span className="font-semibold">{res.label}</span>
                  <div className="flex justify-between">
                    <span className="opacity-70">5yr NPV:</span>
                    <span className={`font-mono ${res.npv > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${Math.round(res.npv).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-70">Total Net Cash Flow:</span>
                    <span className="font-mono">${Math.round(res.totalNetCashFlow).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </CollapsibleSection>
  )
}
