
export async function main(ns: NS) {
  let install = false;
  if (ns.args.length > 0) {
    install = ns.args[0] as boolean
  }
  const faction1 = ns.enums.FactionName.CyberSec;
  const augments1 = ['Neurotrainer I',
    'Cranial Signal Processors - Gen I',
    'Cranial Signal Processors - Gen II',
    'Synaptic Enhancement Implant',
    'BitWire']



  const faction2 = ns.enums.FactionName.NiteSec;
  const augments2 = ['Cranial Signal Processors - Gen II',
    'Neurotrainer II',
    'Embedded Netburner Module',
    'Neural-Retention Enhancement',
    'CRTX42-AA Gene Modification'
  ]

  const faction3 = ns.enums.FactionName.TheBlackHand;
  const augments3 = ['Neuralstimulator',
    'Embedded Netburner Module Core Implant',
    'Enhanced Myelin Sheathing',
    'Cranial Signal Processors - Gen III',
    'Cranial Signal Processors - Gen IV',
    'The Black Hand',
    'DataJack']

  const extra = 'CRTX42-AA Gene Modification'
  const extraa = ns.enums.FactionName.NiteSec

  const faction4 = ns.enums.FactionName.BitRunners;
  const augments4 = ['BitRunners Neurolink',
    'Cranial Signal Processors - Gen V',
    'Neural Accelerator',
    'Embedded Netburner Module Core V2 Upgrade',
    'Artificial Bio-neural Network Implant'];

  let augments = [] as string[];
  let factionName = ns.enums.FactionName.BitRunners;
  let success = true;
  for (let i = 0; i < augments.length; i++) {
    ns.tprint('buying', augments[i]);
    success = ns.singularity.purchaseAugmentation(factionName, augments[i]);
  }


  // buy ram/core
  let counter = 0;
  while (ns.singularity.getUpgradeHomeRamCost() <= (ns.getServerMoneyAvailable('home') / 10)
    && counter <= 100) {
    counter++
    ns.singularity.upgradeHomeRam();
  }
  counter = 0;
  while (ns.singularity.getUpgradeHomeCoresCost() <= (ns.getServerMoneyAvailable('home') / 10)
    && counter <= 100) {
    counter++
    ns.singularity.upgradeHomeCores();
  }


  // buy NeuroFlux with remaining money
  while (success) {
    success = ns.singularity.purchaseAugmentation(factionName, 'NeuroFlux Governor');
  }

  // buy ram/core again, now no restriction
  counter = 0;
  while (ns.singularity.getUpgradeHomeRamCost() <= (ns.getServerMoneyAvailable('home'))
    && counter <= 100) {
    counter++
    ns.singularity.upgradeHomeRam();
  }
  counter = 0;
  while (ns.singularity.getUpgradeHomeCoresCost() <= (ns.getServerMoneyAvailable('home'))
    && counter <= 100) {
    counter++
    ns.singularity.upgradeHomeCores();
  }
  if (install) {
    ns.spawn('scripts/InstallAugments.ts');
  }
}