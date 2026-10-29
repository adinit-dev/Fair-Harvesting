const GUIDANCE = {
  tomato: { category: 'Highly perishable', source: 'ICAR National Agricultural Higher Education Project', sourceUrl: 'https://icar.gov.in/', ambientDays: [3, 7], chilledDays: [10, 14], risks: ['Heat accelerates softening', 'Bruising and excess moisture can increase spoilage'], storage: 'Cool, dry, ventilated storage; avoid sealing ripe fruit in a moisture-trapping container.' },
  potato: { category: 'Generally storable', source: 'ICAR Central Potato Research Institute', sourceUrl: 'https://cpri.icar.gov.in/', ambientDays: [30, 60], controlledDays: [90, 180], risks: ['Light causes greening', 'Excess moisture can promote rot and sprouting'], storage: 'Dark, cool, dry and ventilated storage with suitable humidity.' },
  onion: { category: 'Generally storable', source: 'ICAR Directorate of Onion and Garlic Research', sourceUrl: 'https://icar.gov.in/', ambientDays: [30, 90], controlledDays: [60, 180], risks: ['Moisture promotes sprouting and neck rot'], storage: 'Dry, ventilated storage kept away from wet floors.' },
  turmeric: { category: 'Generally storable when dried', source: 'ICAR Indian Institute of Spices Research', sourceUrl: 'https://spices.res.in/', ambientDays: [180, 365], controlledDays: [365, 730], risks: ['Moisture and mould are the main risks', 'Fresh rhizomes deteriorate faster than properly dried turmeric'], storage: 'Keep dried turmeric in clean, dry, pest-controlled and moisture-proof storage.' },
  rice: { category: 'Generally storable', source: 'ICAR Indian Institute of Rice Research', sourceUrl: 'https://icar-iirr.org.in/', ambientDays: [30, 180], controlledDays: [180, 365], risks: ['Moisture, insects and mould'], storage: 'Dry grain below safe moisture, in clean ventilated and pest-controlled storage.' },
}

export function getStorageGuidance(commodity, condition = '') {
  const normalized = String(commodity || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  const known = GUIDANCE[normalized]
  if (known) return { ...known, estimated: true, assumptions: condition ? `General guidance adjusted for reported condition: ${condition}.` : 'General guidance; variety, maturity and actual storage conditions remain uncertain.' }
  return {
    category: 'Unknown commodity', source: null, sourceUrl: null, ambientDays: null, controlledDays: null,
    risks: ['Commodity-specific shelf life cannot be verified from the available guidance data.'],
    storage: 'Confirm the crop, maturity, handling and storage conditions before relying on a storage window.',
    estimated: false, assumptions: 'No verified crop-specific guidance is installed for this commodity.',
  }
}
