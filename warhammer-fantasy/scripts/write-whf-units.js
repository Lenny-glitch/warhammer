#!/usr/bin/env node
/**
 * WHF Unit Template Writer
 *
 * Writes Empire and Bretonnia unit templates to:
 *   gameData/warhammer-fantasy/{factionId}/units/{unitId}
 *
 * Also writes rosterSchemas for both factions to:
 *   rosterSchemas/warhammer-fantasy/{factionId}
 *
 * Stats sourced from WHF 8th Edition (using 6th Ed army books).
 * Run from repo root: node scripts/write-whf-units.js
 */

const https = require('https');

const DB_HOST = 'warhammer-5f2f4-default-rtdb.firebaseio.com';

// ─── SHARED WEAPON DEFINITIONS ────────────────────────────────────────────────

const W = {
  handWeapon:  { id: 'hand-weapon',  name: 'Hand weapon',   type: 'melee',  S: 0,  AP: 0,  special: [] },
  halberd:     { id: 'halberd',      name: 'Halberd',        type: 'melee',  S: 0,  AP: 0,  special: ['+1 Strength', 'Two-Handed'] },
  shield:      { id: 'shield',       name: 'Shield',         type: 'equipment', S: 0, AP: 0, special: ['+1 Armour Save'] },
  spear:       { id: 'spear',        name: 'Spear',          type: 'melee',  S: 0,  AP: 0,  special: ['Fight in Extra Rank'] },
  greatWeapon: { id: 'great-weapon', name: 'Great weapon',   type: 'melee',  S: 0,  AP: -2, special: ['+2 Strength', 'Strike Last', 'Two-Handed'] },
  lance:       { id: 'lance',        name: 'Lance',          type: 'melee',  S: 0,  AP: 0,  special: ['+2 Strength on Charge', 'Lance Formation', 'Cavalry Only'] },
  bow:         { id: 'bow',          name: 'Bow',            type: 'ranged', range: 24, S: 3, AP: 0, special: [] },
  handgun:     { id: 'handgun',      name: 'Handgun',        type: 'ranged', range: 24, S: 4, AP: -1, special: ['Armour Piercing', 'Move or Fire'] },
  cannonShot:  { id: 'cannon-shot',  name: 'Cannon shot',   type: 'ranged', range: 60, S: 10, AP: -6, special: ['Artillery Dice', 'Bounce D6\"', 'No Cover Save'] },
  mortarShell: { id: 'mortar-shell', name: 'Mortar shell',  type: 'ranged', range: 48, S: 3, AP: 0, special: ['Artillery Dice', 'Scatter', 'Teardrop Template', 'Indirect Fire'] },
  volleySalvo: { id: 'volley-salvo', name: 'Volley gun salvo', type: 'ranged', range: 24, S: 5, AP: 0, special: ['Artillery Dice', 'Multiple Shots', 'Misfire Table'] },
};

// ─── SHARED MOUNTS ────────────────────────────────────────────────────────────

const MOUNTS = {
  warhorse: {
    id: 'warhorse', name: 'Warhorse',
    stats: { M: '8"', WS: '3', S: '3', T: '3', A: '1', I: '3' },
    additionalAttacks: 1, points: 20,
  },
  bardedWarhorse: {
    id: 'barded-warhorse', name: 'Barded Warhorse',
    stats: { M: '7"', WS: '3', S: '3', T: '3', A: '1', I: '3' },
    additionalAttacks: 1, points: 26,
  },
};

// ─── SHARED CREW PROFILE (Empire artillery) ───────────────────────────────────

const EMPIRE_CREW = { M: '4"', WS: '3', BS: '3', S: '3', T: '3', W: '1', I: '3', A: '1', Ld: '7', Sv: '6+' };

// ─── EMPIRE UNITS ─────────────────────────────────────────────────────────────

const empireUnits = {

  'state-troops': {
    id: 'state-troops',
    name: 'Halberdiers',
    gameSystem: 'warhammer-fantasy',
    faction: 'The Empire',
    factionId: 'the-empire',
    category: 'core',
    unitType: 'infantry',
    pointsPerModel: 5,
    unitSize: { min: 10, max: 50 },
    defaultRanks: 4,
    stats: { M: '4"', WS: '3', BS: '3', S: '3', T: '3', W: '1', I: '3', A: '1', Ld: '7', Sv: '6+' },
    weapons: {
      'halberd':      W.halberd,
      'hand-weapon':  W.handWeapon,
      'shield':       W.shield,
    },
    defaultLoadout: { weapon: 'halberd' },
    isWarMachine: false, hasMounts: false, isPsyker: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    abilities: [],
    keywords: ['STATE TROOPS', 'INFANTRY', 'THE EMPIRE'],
    source: 'manual',
  },

  'handgunners': {
    id: 'handgunners',
    name: 'Handgunners',
    gameSystem: 'warhammer-fantasy',
    faction: 'The Empire',
    factionId: 'the-empire',
    category: 'core',
    unitType: 'infantry',
    pointsPerModel: 9,
    unitSize: { min: 10, max: 40 },
    defaultRanks: 4,
    stats: { M: '4"', WS: '3', BS: '3', S: '3', T: '3', W: '1', I: '3', A: '1', Ld: '7', Sv: '6+' },
    weapons: {
      'handgun':      W.handgun,
      'hand-weapon':  W.handWeapon,
    },
    defaultLoadout: { weapon: 'handgun' },
    isWarMachine: false, hasMounts: false, isPsyker: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    abilities: [],
    keywords: ['STATE TROOPS', 'INFANTRY', 'THE EMPIRE'],
    source: 'manual',
  },

  'greatswords': {
    id: 'greatswords',
    name: 'Greatswords',
    gameSystem: 'warhammer-fantasy',
    faction: 'The Empire',
    factionId: 'the-empire',
    category: 'special',
    unitType: 'infantry',
    pointsPerModel: 13,
    unitSize: { min: 10, max: 30 },
    defaultRanks: 4,
    stats: { M: '4"', WS: '4', BS: '3', S: '3', T: '3', W: '1', I: '3', A: '1', Ld: '8', Sv: '4+' },
    weapons: {
      'great-weapon': W.greatWeapon,
    },
    defaultLoadout: { weapon: 'great-weapon' },
    isWarMachine: false, hasMounts: false, isPsyker: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: true, immuneToPsychology: false,
    abilities: [
      { name: 'Stubborn', description: 'Always uses unmodified Leadership on Break tests, regardless of casualties.' },
    ],
    keywords: ['INFANTRY', 'SPECIAL UNIT', 'THE EMPIRE'],
    source: 'manual',
  },

  'knights': {
    id: 'knights',
    name: 'Empire Knights',
    gameSystem: 'warhammer-fantasy',
    faction: 'The Empire',
    factionId: 'the-empire',
    category: 'special',
    unitType: 'cavalry',
    pointsPerModel: 23,
    unitSize: { min: 5, max: 15 },
    defaultRanks: 2,
    // Stats reflect mounted model: M from barded warhorse (7"), Sv from full plate + shield + barding (1+)
    stats: { M: '7"', WS: '3', BS: '3', S: '3', T: '3', W: '1', I: '3', A: '1', Ld: '8', Sv: '1+' },
    weapons: {
      'lance':        W.lance,
      'hand-weapon':  W.handWeapon,
    },
    defaultLoadout: { weapon: 'lance' },
    hasMounts: true,
    mountOptions: [ MOUNTS.bardedWarhorse ],
    isWarMachine: false, isPsyker: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    abilities: [],
    keywords: ['CAVALRY', 'THE EMPIRE'],
    source: 'manual',
  },

  'general-of-the-empire': {
    id: 'general-of-the-empire',
    name: 'General of the Empire',
    gameSystem: 'warhammer-fantasy',
    faction: 'The Empire',
    factionId: 'the-empire',
    category: 'lord',
    unitType: 'character',
    points: 100,
    unitSize: { min: 1, max: 1 },
    // Base stats on foot, full plate + shield = 2+
    stats: { M: '4"', WS: '6', BS: '5', S: '4', T: '4', W: '3', I: '6', A: '3', Ld: '9', Sv: '2+' },
    weapons: {
      'hand-weapon': W.handWeapon,
    },
    defaultLoadout: { weapon: 'hand-weapon' },
    hasMounts: true,
    mountOptions: [ MOUNTS.warhorse, MOUNTS.bardedWarhorse ],
    isWarMachine: false, isPsyker: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    isCharacter: true, isGeneral: true,
    abilities: [
      { name: 'Inspiring Presence', description: 'Friendly units within 12" use the General\'s unmodified Leadership for Panic and Break tests.' },
    ],
    keywords: ['CHARACTER', 'LORD', 'GENERAL', 'THE EMPIRE'],
    source: 'manual',
  },

  'empire-captain': {
    id: 'empire-captain',
    name: 'Empire Captain',
    gameSystem: 'warhammer-fantasy',
    faction: 'The Empire',
    factionId: 'the-empire',
    category: 'hero',
    unitType: 'character',
    points: 60,
    unitSize: { min: 1, max: 1 },
    // Base stats on foot, full plate + shield = 2+
    stats: { M: '4"', WS: '5', BS: '4', S: '4', T: '3', W: '2', I: '5', A: '2', Ld: '8', Sv: '2+' },
    weapons: {
      'hand-weapon': W.handWeapon,
    },
    defaultLoadout: { weapon: 'hand-weapon' },
    hasMounts: true,
    mountOptions: [ MOUNTS.warhorse, MOUNTS.bardedWarhorse ],
    isWarMachine: false, isPsyker: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    isCharacter: true, isGeneral: false,
    abilities: [],
    keywords: ['CHARACTER', 'HERO', 'THE EMPIRE'],
    source: 'manual',
  },

  'wizard': {
    id: 'wizard',
    name: 'Battle Wizard',
    gameSystem: 'warhammer-fantasy',
    faction: 'The Empire',
    factionId: 'the-empire',
    category: 'hero',
    unitType: 'character',
    points: 65,
    unitSize: { min: 1, max: 1 },
    stats: { M: '4"', WS: '3', BS: '3', S: '3', T: '3', W: '2', I: '3', A: '1', Ld: '7', Sv: '6+' },
    weapons: {
      'hand-weapon': W.handWeapon,
    },
    defaultLoadout: { weapon: 'hand-weapon' },
    hasMounts: false,
    isPsyker: true,
    wizardLevel: 1,
    wizardLevelMax: 2,
    lore: 'lore-of-fire',
    loreOptions: [
      'lore-of-fire', 'lore-of-metal', 'lore-of-light', 'lore-of-heavens',
      'lore-of-life', 'lore-of-shadow', 'lore-of-beasts', 'lore-of-death',
    ],
    isWarMachine: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    isCharacter: true, isGeneral: false,
    abilities: [
      { name: 'Magic User', description: 'Adds wizard level to the power/dispel dice pool each Magic phase. Knows a number of spells equal to wizard level + 1.' },
    ],
    keywords: ['CHARACTER', 'HERO', 'WIZARD', 'THE EMPIRE'],
    source: 'manual',
  },

  'cannon': {
    id: 'cannon',
    name: 'Cannon',
    gameSystem: 'warhammer-fantasy',
    faction: 'The Empire',
    factionId: 'the-empire',
    category: 'special',
    unitType: 'war_machine',
    points: 100,
    unitSize: { min: 1, max: 1 },
    // Machine stats: T and W for the machine itself; other fields not applicable
    stats: { M: '-', WS: '-', BS: '3', S: '-', T: '7', W: '3', I: '-', A: '-', Ld: '-', Sv: '-' },
    isWarMachine: true,
    crewCount: 3,
    crewStats: EMPIRE_CREW,
    machineWounds: 3,
    artilleryDice: true,
    scatterDice: true,
    templateType: null,
    weapons: {
      'cannon-shot': W.cannonShot,
    },
    defaultLoadout: { weapon: 'cannon-shot' },
    hasMounts: false, isPsyker: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    abilities: [
      { name: 'Misfire', description: 'On an Artillery Dice Misfire result, roll on the Cannon Misfire Table.' },
    ],
    keywords: ['WAR MACHINE', 'THE EMPIRE'],
    source: 'manual',
  },

  'mortar': {
    id: 'mortar',
    name: 'Mortar',
    gameSystem: 'warhammer-fantasy',
    faction: 'The Empire',
    factionId: 'the-empire',
    category: 'special',
    unitType: 'war_machine',
    points: 75,
    unitSize: { min: 1, max: 1 },
    stats: { M: '-', WS: '-', BS: '3', S: '-', T: '7', W: '2', I: '-', A: '-', Ld: '-', Sv: '-' },
    isWarMachine: true,
    crewCount: 3,
    crewStats: EMPIRE_CREW,
    machineWounds: 2,
    artilleryDice: true,
    scatterDice: true,
    templateType: 'teardrop',
    weapons: {
      'mortar-shell': W.mortarShell,
    },
    defaultLoadout: { weapon: 'mortar-shell' },
    hasMounts: false, isPsyker: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    abilities: [
      { name: 'Indirect Fire', description: 'Can fire over intervening units — no line of sight required. Place teardrop template, scatter D6" on a miss.' },
      { name: 'Misfire', description: 'On an Artillery Dice Misfire result, roll on the Stone Thrower Misfire Table.' },
    ],
    keywords: ['WAR MACHINE', 'THE EMPIRE'],
    source: 'manual',
  },

  'hellblaster-volley-gun': {
    id: 'hellblaster-volley-gun',
    name: 'Hellblaster Volley Gun',
    gameSystem: 'warhammer-fantasy',
    faction: 'The Empire',
    factionId: 'the-empire',
    category: 'special',
    unitType: 'war_machine',
    points: 130,
    unitSize: { min: 1, max: 1 },
    stats: { M: '-', WS: '-', BS: '3', S: '-', T: '7', W: '2', I: '-', A: '-', Ld: '-', Sv: '-' },
    isWarMachine: true,
    crewCount: 3,
    crewStats: EMPIRE_CREW,
    machineWounds: 2,
    artilleryDice: true,
    scatterDice: false,
    templateType: null,
    weapons: {
      'volley-salvo': W.volleySalvo,
    },
    defaultLoadout: { weapon: 'volley-salvo' },
    hasMounts: false, isPsyker: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    abilities: [
      { name: 'Misfire', description: 'On an Artillery Dice Misfire, roll on the Hellblaster Misfire Table — results range from misfires to explosion destroying the machine.' },
    ],
    keywords: ['WAR MACHINE', 'THE EMPIRE'],
    source: 'manual',
  },

};

// ─── BRETONNIA UNITS ──────────────────────────────────────────────────────────

const bretonniaUnits = {

  'men-at-arms': {
    id: 'men-at-arms',
    name: 'Men-at-Arms',
    gameSystem: 'warhammer-fantasy',
    faction: 'Bretonnia',
    factionId: 'bretonnia',
    category: 'core',
    unitType: 'infantry',
    pointsPerModel: 4,
    unitSize: { min: 10, max: 40 },
    defaultRanks: 4,
    // Light armour + shield = 5+ save
    stats: { M: '4"', WS: '2', BS: '2', S: '3', T: '3', W: '1', I: '2', A: '1', Ld: '5', Sv: '5+' },
    weapons: {
      'spear':        W.spear,
      'hand-weapon':  W.handWeapon,
      'shield':       W.shield,
    },
    defaultLoadout: { weapon: 'spear' },
    isWarMachine: false, hasMounts: false, isPsyker: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    abilities: [
      { name: 'Blessing of the Lady', description: 'Models in this unit within 12" of a Bretonnian character with the Blessing receive a 6+ Ward Save.' },
    ],
    keywords: ['PEASANT', 'INFANTRY', 'BRETONNIA'],
    source: 'manual',
  },

  'peasant-bowmen': {
    id: 'peasant-bowmen',
    name: 'Peasant Bowmen',
    gameSystem: 'warhammer-fantasy',
    faction: 'Bretonnia',
    factionId: 'bretonnia',
    category: 'core',
    unitType: 'infantry',
    pointsPerModel: 6,
    unitSize: { min: 10, max: 40 },
    defaultRanks: 4,
    stats: { M: '4"', WS: '2', BS: '3', S: '3', T: '3', W: '1', I: '2', A: '1', Ld: '5', Sv: '6+' },
    weapons: {
      'bow':          W.bow,
      'hand-weapon':  W.handWeapon,
    },
    defaultLoadout: { weapon: 'bow' },
    isWarMachine: false, hasMounts: false, isPsyker: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    abilities: [
      { name: 'Blessing of the Lady', description: 'Models in this unit within 12" of a Bretonnian character with the Blessing receive a 6+ Ward Save.' },
      { name: 'Stakes', description: 'May be deployed with sharpened stakes — charging enemy cavalry suffer a -1 penalty to their attack roll.' },
    ],
    keywords: ['PEASANT', 'INFANTRY', 'BRETONNIA'],
    source: 'manual',
  },

  'knights-of-the-realm': {
    id: 'knights-of-the-realm',
    name: 'Knights of the Realm',
    gameSystem: 'warhammer-fantasy',
    faction: 'Bretonnia',
    factionId: 'bretonnia',
    category: 'core',
    unitType: 'cavalry',
    pointsPerModel: 27,
    unitSize: { min: 5, max: 20 },
    defaultRanks: 2,
    // Full plate + shield + barding = 1+
    stats: { M: '7"', WS: '4', BS: '3', S: '4', T: '3', W: '1', I: '4', A: '1', Ld: '8', Sv: '1+' },
    weapons: {
      'lance':        W.lance,
      'hand-weapon':  W.handWeapon,
    },
    defaultLoadout: { weapon: 'lance' },
    hasMounts: true,
    mountOptions: [ MOUNTS.bardedWarhorse ],
    isWarMachine: false, isPsyker: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    abilities: [
      { name: 'Blessing of the Lady', description: '6+ Ward Save while the unit has not broken and the General has the Blessing.' },
      { name: 'Knightly Vow', description: 'Does not suffer Panic from friendly infantry fleeing through the unit.' },
      { name: 'Lance Formation', description: 'All models in the first two ranks fight on the charge.' },
    ],
    keywords: ['KNIGHT', 'CAVALRY', 'BRETONNIA'],
    source: 'manual',
  },

  'questing-knights': {
    id: 'questing-knights',
    name: 'Questing Knights',
    gameSystem: 'warhammer-fantasy',
    faction: 'Bretonnia',
    factionId: 'bretonnia',
    category: 'special',
    unitType: 'cavalry',
    pointsPerModel: 30,
    unitSize: { min: 5, max: 15 },
    defaultRanks: 2,
    // Full plate + barding, no shield (two-handed great weapon) = 2+
    stats: { M: '7"', WS: '5', BS: '3', S: '4', T: '3', W: '1', I: '5', A: '2', Ld: '9', Sv: '2+' },
    weapons: {
      'great-weapon': W.greatWeapon,
      'hand-weapon':  W.handWeapon,
    },
    defaultLoadout: { weapon: 'great-weapon' },
    hasMounts: true,
    mountOptions: [ MOUNTS.bardedWarhorse ],
    isWarMachine: false, isPsyker: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    abilities: [
      { name: 'Blessing of the Lady', description: '6+ Ward Save while the unit has not broken and the General has the Blessing.' },
      { name: 'Questing Vow', description: 'Immune to Panic, Fear, and Terror — treats all Panic tests as if the unit were Stubborn.' },
    ],
    keywords: ['KNIGHT', 'CAVALRY', 'BRETONNIA'],
    source: 'manual',
  },

  'grail-knights': {
    id: 'grail-knights',
    name: 'Grail Knights',
    gameSystem: 'warhammer-fantasy',
    faction: 'Bretonnia',
    factionId: 'bretonnia',
    category: 'rare',
    unitType: 'cavalry',
    pointsPerModel: 50,
    unitSize: { min: 5, max: 10 },
    defaultRanks: 2,
    // Full plate + shield + barding = 1+; Grail Vow adds 5+ Ward Save
    stats: { M: '7"', WS: '6', BS: '3', S: '4', T: '3', W: '1', I: '6', A: '3', Ld: '10', Sv: '1+' },
    weapons: {
      'lance':        W.lance,
      'hand-weapon':  W.handWeapon,
    },
    defaultLoadout: { weapon: 'lance' },
    hasMounts: true,
    mountOptions: [ MOUNTS.bardedWarhorse ],
    isWarMachine: false, isPsyker: false,
    causesFear: true, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: true,
    abilities: [
      { name: 'Grail Vow', description: 'Immune to Psychology. Causes Fear. Blessed by the Lady: 5+ Ward Save at all times.' },
      { name: 'Lance Formation', description: 'All models in the first two ranks fight on the charge.' },
    ],
    keywords: ['KNIGHT', 'CAVALRY', 'GRAIL', 'BRETONNIA'],
    source: 'manual',
  },

  'bretonnian-lord': {
    id: 'bretonnian-lord',
    name: 'Bretonnian Lord',
    gameSystem: 'warhammer-fantasy',
    faction: 'Bretonnia',
    factionId: 'bretonnia',
    category: 'lord',
    unitType: 'character',
    points: 125,
    unitSize: { min: 1, max: 1 },
    // Base stats on foot, full plate + shield = 2+
    stats: { M: '4"', WS: '7', BS: '4', S: '5', T: '4', W: '3', I: '7', A: '4', Ld: '10', Sv: '2+' },
    weapons: {
      'lance':        W.lance,
      'hand-weapon':  W.handWeapon,
    },
    defaultLoadout: { weapon: 'lance' },
    hasMounts: true,
    mountOptions: [ MOUNTS.warhorse, MOUNTS.bardedWarhorse ],
    isWarMachine: false, isPsyker: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    isCharacter: true, isGeneral: true,
    abilities: [
      { name: 'Blessing of the Lady', description: '5+ Ward Save (General\'s blessing radiates to all Bretonnian units on the battlefield).' },
      { name: 'Inspiring Presence', description: 'Friendly units within 12" use the Lord\'s Leadership on Break tests.' },
      { name: 'Vow', description: 'May take the Questing Vow or Grail Vow, granting additional special rules (see roster options).' },
    ],
    keywords: ['CHARACTER', 'LORD', 'KNIGHT', 'BRETONNIA'],
    source: 'manual',
  },

  'paladin': {
    id: 'paladin',
    name: 'Paladin',
    gameSystem: 'warhammer-fantasy',
    faction: 'Bretonnia',
    factionId: 'bretonnia',
    category: 'hero',
    unitType: 'character',
    points: 80,
    unitSize: { min: 1, max: 1 },
    // Full plate + shield = 2+
    stats: { M: '4"', WS: '6', BS: '3', S: '4', T: '3', W: '2', I: '6', A: '3', Ld: '9', Sv: '2+' },
    weapons: {
      'lance':        W.lance,
      'hand-weapon':  W.handWeapon,
    },
    defaultLoadout: { weapon: 'lance' },
    hasMounts: true,
    mountOptions: [ MOUNTS.warhorse, MOUNTS.bardedWarhorse ],
    isWarMachine: false, isPsyker: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    isCharacter: true, isGeneral: false,
    abilities: [
      { name: 'Blessing of the Lady', description: '5+ Ward Save.' },
    ],
    keywords: ['CHARACTER', 'HERO', 'KNIGHT', 'BRETONNIA'],
    source: 'manual',
  },

  'damsel': {
    id: 'damsel',
    name: 'Damsel',
    gameSystem: 'warhammer-fantasy',
    faction: 'Bretonnia',
    factionId: 'bretonnia',
    category: 'hero',
    unitType: 'character',
    points: 90,
    unitSize: { min: 1, max: 1 },
    stats: { M: '4"', WS: '3', BS: '3', S: '3', T: '3', W: '2', I: '4', A: '1', Ld: '8', Sv: '-' },
    weapons: {
      'hand-weapon': W.handWeapon,
    },
    defaultLoadout: { weapon: 'hand-weapon' },
    hasMounts: true,
    mountOptions: [ MOUNTS.warhorse ],
    isPsyker: true,
    wizardLevel: 1,
    wizardLevelMax: 2,
    lore: 'lore-of-beasts',
    loreOptions: ['lore-of-beasts'],
    isWarMachine: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    isCharacter: true, isGeneral: false,
    abilities: [
      { name: 'Blessing of the Lady', description: '6+ Ward Save (Damsel-level blessing).' },
      { name: 'Lore of Beasts Only', description: 'Damsels may only use the Lore of Beasts — they are forbidden all other colleges of magic.' },
    ],
    keywords: ['CHARACTER', 'HERO', 'WIZARD', 'BRETONNIA'],
    source: 'manual',
  },

  'prophetess': {
    id: 'prophetess',
    name: 'Prophetess',
    gameSystem: 'warhammer-fantasy',
    faction: 'Bretonnia',
    factionId: 'bretonnia',
    category: 'lord',
    unitType: 'character',
    points: 175,
    unitSize: { min: 1, max: 1 },
    stats: { M: '4"', WS: '3', BS: '3', S: '3', T: '3', W: '3', I: '4', A: '1', Ld: '9', Sv: '-' },
    weapons: {
      'hand-weapon': W.handWeapon,
    },
    defaultLoadout: { weapon: 'hand-weapon' },
    hasMounts: true,
    mountOptions: [ MOUNTS.warhorse ],
    isPsyker: true,
    wizardLevel: 3,
    wizardLevelMax: 4,
    lore: 'lore-of-beasts',
    loreOptions: ['lore-of-beasts'],
    isWarMachine: false,
    causesFear: false, causesTerror: false,
    isUnbreakable: false, isStubborn: false, immuneToPsychology: false,
    isCharacter: true, isGeneral: false,
    abilities: [
      { name: 'Blessing of the Lady', description: '5+ Ward Save (Prophetess-level blessing, extends to army while on foot or mounted).' },
      { name: 'Lore of Beasts Only', description: 'Prophetesses may only use the Lore of Beasts.' },
    ],
    keywords: ['CHARACTER', 'LORD', 'WIZARD', 'BRETONNIA'],
    source: 'manual',
  },

};

// ─── ROSTER SCHEMAS ───────────────────────────────────────────────────────────

const empireSchema = {
  factionId: 'the-empire',
  factionName: 'The Empire',
  gameSystem: 'warhammer-fantasy',
  statBlock: ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld', 'Sv'],
  weaponProfiles: ['type', 'range', 'S', 'AP', 'special'],
  compositionRules: {
    minCorePercent: 25,
    requirements: [
      {
        id: 'general-required',
        min: 1,
        description: 'Army must include at least 1 General of the Empire or Empire Captain designated as army general.',
        eligibleUnits: ['general-of-the-empire', 'empire-captain'],
      },
    ],
  },
  unitCategories: {
    lord:    { units: ['general-of-the-empire'] },
    hero:    { units: ['empire-captain', 'wizard'] },
    core:    { units: ['state-troops', 'handgunners'] },
    special: { units: ['greatswords', 'knights', 'cannon', 'mortar', 'hellblaster-volley-gun'] },
    rare:    { units: [] },
  },
};

const bretonniaSchema = {
  factionId: 'bretonnia',
  factionName: 'Bretonnia',
  gameSystem: 'warhammer-fantasy',
  statBlock: ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld', 'Sv'],
  weaponProfiles: ['type', 'range', 'S', 'AP', 'special'],
  compositionRules: {
    minCorePercent: 25,
    requirements: [
      {
        id: 'lord-or-paladin-required',
        min: 1,
        description: 'Army must include at least 1 Bretonnian Lord or Paladin.',
        eligibleUnits: ['bretonnian-lord', 'paladin'],
      },
    ],
  },
  unitCategories: {
    lord:    { units: ['bretonnian-lord', 'prophetess'] },
    hero:    { units: ['paladin', 'damsel'] },
    core:    { units: ['men-at-arms', 'peasant-bowmen', 'knights-of-the-realm'] },
    special: { units: ['questing-knights'] },
    rare:    { units: ['grail-knights'] },
  },
};

// ─── FIREBASE WRITE ────────────────────────────────────────────────────────────

function put(fbPath, data) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(data));
    const req  = https.request({
      hostname: DB_HOST,
      path:     `/${fbPath}.json`,
      method:   'PUT',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': body.length,
      },
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        if (res.statusCode === 200) resolve({ status: 200 });
        else reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('WHF Unit Template Writer\n');

  // Section 1: Empire units
  console.log('=== Section 1: Empire Units ===');
  const empirePath = 'gameData/warhammer-fantasy/the-empire/units';
  console.log(`Writing ${Object.keys(empireUnits).length} units → ${empirePath}`);
  await put(empirePath, empireUnits);
  console.log('  ✓ Empire units written\n');

  // Section 2: Bretonnia units
  console.log('=== Section 2: Bretonnia Units ===');
  const bretPath = 'gameData/warhammer-fantasy/bretonnia/units';
  console.log(`Writing ${Object.keys(bretonniaUnits).length} units → ${bretPath}`);
  await put(bretPath, bretonniaUnits);
  console.log('  ✓ Bretonnia units written\n');

  // Section 3: Roster schemas
  console.log('=== Section 3: Roster Schemas ===');
  await put('rosterSchemas/warhammer-fantasy/the-empire', empireSchema);
  console.log('  ✓ Empire schema written');
  await put('rosterSchemas/warhammer-fantasy/bretonnia', bretonniaSchema);
  console.log('  ✓ Bretonnia schema written\n');

  console.log('All done.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
