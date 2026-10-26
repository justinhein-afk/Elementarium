/* Elementarium — the periodic table.
 * All 118 elements with real melting/boiling points (°C) and densities. A periodic element's
 * state isn't fixed: the engine decides solid / liquid / gas per cell from its temperature,
 * so mercury pours, gallium melts on a warm day and nitrogen liquefies at −196°C.
 * Densities are g/cm³ for solids and liquids, g/L for the elements that are gases at 20°C. */
(function (G) {
  'use strict';
  const { CAT, R } = G.ELEM;

  // fam: alk alkali · ae alkaline earth · tm transition · pt post-transition · md metalloid ·
  //      nm nonmetal · hal halogen · ng noble gas · ln lanthanide · an actinide · sh superheavy
  // Extras:
  //   powder   solid crumbles instead of standing as a block
  //   flame    flame-test colour when it burns     dis    glow colour when current runs through its gas
  //   gas      visible colour of the gas           liq    colour of the liquid, if different
  //   wr       reacts with water: [chance, blast radius, blast power]
  //   corr     halogen corrosion strength          toxic  poisons fish and plants
  //   noble    resists acid                        abs    absorbs neutrons (control rods)
  //   heat     decay heat per tick                 rad    chance per tick to emit radiation
  //   nem      chance per tick to emit neutrons    fis    chance a passing neutron splits it
  //   decay    [chance per tick, becomes, 'a' if alpha decay (gives off helium)]
  //   glow     [strength, colour] — radioluminescence or chemiluminescence
  //   gl       gas density in g/L (for heavy vapours)
  //   blast    colour of the flash when it explodes; blastGlow, how bright (fissile ones flash white)
  //   phos     phosphor: [colour, afterglow ticks, colour name] — lights up when current or radiation hits it
  //   glass    [colour, name] it stains molten glass       spark   colour of the sparks it throws burning
  //   ohm      [°C per pulse of current, hottest it gets] — resistance heating (filaments)
  //   solar · seebeck · capacitor   makes current in light · from a temperature difference · stores it
  //   sc       superconducts below this temperature
  const T = [
    [1, 'H', 'Hydrogen', 'nm', -259.1, -252.9, 0.0899, '#e8f0ff', { flam: 1, ign: 500, burn: [3, 8], explode: [2, 0.4], flame: '#9ec5ff', gas: '#e4ecff', blast: '#bcd6ff', blastGlow: 0.4 }],
    [2, 'He', 'Helium', 'ng', -272.2, -268.9, 0.1786, '#fff4e0', { dis: '#ffc0a0' }],
    [3, 'Li', 'Lithium', 'alk', 180.5, 1342, 0.534, '#c8c8c0', { flam: 0.4, ign: 180, flame: '#ff2a4a', wr: [0.05, 1, 0.25] }],
    [4, 'Be', 'Beryllium', 'ae', 1287, 2469, 1.85, '#b8bcc0', { toxic: 1 }],
    [5, 'B', 'Boron', 'md', 2076, 3927, 2.34, '#4a3a30', { powder: 1, flame: '#6aff5a', abs: 0.6 }],
    [6, 'C', 'Carbon', 'nm', 3550, 4027, 2.267, '#2b2b2b', { powder: 1, flam: 0.08, ign: 700, burn: [600, 900], burnTemp: 1100, burnInto: [['smoke', 2], ['ash', 1]], conduct: 1 }],
    [7, 'N', 'Nitrogen', 'nm', -210, -195.8, 1.251, '#e0e8ff', { dis: '#c08aff', liq: '#d8e6ff' }],
    [8, 'O', 'Oxygen', 'nm', -218.8, -183, 1.429, '#dff2ff', { liq: '#8ab8ff', oxid: 1, para: 1 }],
    [9, 'F', 'Fluorine', 'hal', -219.7, -188.1, 1.696, '#f2ecaa', { gas: '#efe6a0', corr: 0.4 }],
    [10, 'Ne', 'Neon', 'ng', -248.6, -246, 0.9002, '#ffe6e0', { dis: '#ff5a28' }],
    [11, 'Na', 'Sodium', 'alk', 97.8, 883, 0.968, '#d8d8d0', { flam: 0.4, ign: 115, flame: '#ffb020', wr: [0.15, 2, 0.45], dis: '#ffb030' }],
    [12, 'Mg', 'Magnesium', 'ae', 650, 1090, 1.738, '#c9ccd0', { flam: 0.3, ign: 600, burn: [60, 120], burnTemp: 3000, fireEmit: 0.45, flame: '#ffffff', waterproof: 1, burnInto: [['ash', 1]], spark: '#ffffff' }],
    [13, 'Al', 'Aluminium', 'pt', 660.3, 2470, 2.7, '#c8ccd2', { cond: 0.95, spark: '#f4f4ff' }],
    [14, 'Si', 'Silicon', 'md', 1414, 3265, 2.329, '#5d6878', { conduct: 1, solar: 1 }],
    [15, 'P', 'Phosphorus', 'nm', 44.2, 280.5, 1.82, '#f0ecd0', { powder: 1, flam: 1, ign: 34, burn: [20, 40], burnTemp: 900, fireEmit: 0.4, flame: '#f0ffe0', glow: [0.25, '#b8ff9a'], burnInto: [['smoke', 1]] }],
    [16, 'S', 'Sulfur', 'nm', 115.2, 444.6, 2.07, '#e8d43a', { powder: 1, flam: 0.5, ign: 232, burn: [40, 80], burnTemp: 600, flame: '#4a6aff', liq: '#b8401a', burnInto: [['smoke', 1]] }],
    [17, 'Cl', 'Chlorine', 'hal', -101.5, -34, 3.214, '#c8e05a', { gas: '#c6e05a', corr: 0.15 }],
    [18, 'Ar', 'Argon', 'ng', -189.3, -185.8, 1.784, '#f0eaff', { dis: '#b46aff' }],
    [19, 'K', 'Potassium', 'alk', 63.5, 759, 0.862, '#d0d0c8', { flam: 0.4, ign: 60, flame: '#c88aff', wr: [0.3, 2, 0.6] }],
    [20, 'Ca', 'Calcium', 'ae', 842, 1484, 1.55, '#d8d8cc', { flame: '#ff6a2a', fizz: 1 }],
    [21, 'Sc', 'Scandium', 'tm', 1541, 2836, 2.985, '#c8c8c0', {}],
    [22, 'Ti', 'Titanium', 'tm', 1668, 3287, 4.506, '#9aa0a8', { spark: '#fff6e0' }],
    [23, 'V', 'Vanadium', 'tm', 1910, 3407, 6.0, '#a8aab0', {}],
    [24, 'Cr', 'Chromium', 'tm', 1907, 2671, 7.19, '#cdd2da', { glass: ['#2fae55', 'emerald green'] }],
    [25, 'Mn', 'Manganese', 'tm', 1246, 2061, 7.21, '#9a948e', { glass: ['#9a4ad0', 'amethyst purple'] }],
    [26, 'Fe', 'Iron', 'tm', 1538, 2862, 7.874, '#8a8f96', { rusts: 1, spark: '#ffb04a', curie: 770 }],
    [27, 'Co', 'Cobalt', 'tm', 1495, 2927, 8.9, '#8e9ab8', { glass: ['#2a4fe0', 'cobalt blue'], curie: 1115 }],
    [28, 'Ni', 'Nickel', 'tm', 1455, 2913, 8.908, '#b8b2a0', { curie: 358 }],
    [29, 'Cu', 'Copper', 'tm', 1084.6, 2562, 8.96, '#c87533', { flame: '#3affb0', cond: 0.95, glass: ['#2ab8b0', 'turquoise'] }],
    [30, 'Zn', 'Zinc', 'tm', 419.5, 907, 7.14, '#a8b2bc', { flame: '#9ad0ff', phos: ['#9affb4', 120, 'green'] }], // zinc sulfide, Rutherford's scintillator
    [31, 'Ga', 'Gallium', 'pt', 29.8, 2400, 5.91, '#c0c8d0', {}],
    [32, 'Ge', 'Germanium', 'md', 938.3, 2833, 5.323, '#a0a6ae', { conduct: 1 }],
    [33, 'As', 'Arsenic', 'md', 615, 615, 5.727, '#6e7378', { toxic: 1, flame: '#8aa0ff', conduct: 1 }],
    [34, 'Se', 'Selenium', 'nm', 221, 685, 4.81, '#7a2e2e', { powder: 1, flame: '#6a9aff', glass: ['#e8402a', 'red'] }],
    [35, 'Br', 'Bromine', 'hal', -7.2, 58.8, 3.1028, '#8a2412', { gas: '#b8501e', corr: 0.1, gl: 7.1 }],
    [36, 'Kr', 'Krypton', 'ng', -157.4, -153.4, 3.749, '#f0f0ff', { dis: '#e8e0ff' }],
    [37, 'Rb', 'Rubidium', 'alk', 39.3, 688, 1.532, '#d0ccc0', { flam: 0.4, ign: 40, flame: '#d04a8a', wr: [0.5, 3, 0.75] }],
    [38, 'Sr', 'Strontium', 'ae', 777, 1382, 2.64, '#d8d4c0', { flame: '#ff1a2a', fizz: 1 }],
    [39, 'Y', 'Yttrium', 'tm', 1526, 3345, 4.472, '#c4c4bc', { sc: -180 }],
    [40, 'Zr', 'Zirconium', 'tm', 1855, 4409, 6.52, '#bcbcb4', { flam: 0.3, ign: 1100, burn: [60, 120], burnTemp: 2400, fireEmit: 0.4, flame: '#ffffff', burnInto: [['ash', 1]], spark: '#fffef0' }],
    [41, 'Nb', 'Niobium', 'tm', 2477, 4744, 8.57, '#a8acb8', { sc: -264 }],
    [42, 'Mo', 'Molybdenum', 'tm', 2623, 4639, 10.28, '#a4a8ae', { ohm: [180, 2300] }],
    [43, 'Tc', 'Technetium', 'tm', 2157, 4265, 11, '#b0b4b8', { heat: 0.002, rad: 0.001 }],
    [44, 'Ru', 'Ruthenium', 'tm', 2334, 4150, 12.45, '#bcbec4', { noble: 1 }],
    [45, 'Rh', 'Rhodium', 'tm', 1964, 3695, 12.41, '#d0d2d6', { noble: 1 }],
    [46, 'Pd', 'Palladium', 'tm', 1554.9, 2963, 12.023, '#c8c6c0', { noble: 1 }],
    [47, 'Ag', 'Silver', 'tm', 961.8, 2162, 10.49, '#d8dce0', { noble: 1, cond: 1, glass: ['#f0c838', 'amber yellow'] }],
    [48, 'Cd', 'Cadmium', 'tm', 321.1, 767, 8.65, '#b4bcc4', { abs: 0.85, toxic: 1 }],
    [49, 'In', 'Indium', 'pt', 156.6, 2072, 7.31, '#c0c4cc', { abs: 0.3, flame: '#6a6aff' }],
    [50, 'Sn', 'Tin', 'pt', 231.9, 2602, 7.287, '#c8c8c8', {}],
    [51, 'Sb', 'Antimony', 'md', 630.6, 1587, 6.685, '#a8acb4', { conduct: 1 }],
    [52, 'Te', 'Tellurium', 'md', 449.5, 988, 6.232, '#b4b8bc', { conduct: 1, seebeck: 1 }],
    [53, 'I', 'Iodine', 'hal', 113.7, 184.3, 4.93, '#3e3248', { powder: 1, gas: '#9a50d8', corr: 0.03, gl: 11.3 }],
    [54, 'Xe', 'Xenon', 'ng', -111.8, -108.1, 5.894, '#e8eeff', { dis: '#6a8aff' }],
    [55, 'Cs', 'Caesium', 'alk', 28.4, 671, 1.93, '#e0cf96', { flam: 0.4, ign: 30, flame: '#7a7aff', wr: [0.8, 4, 0.9] }],
    [56, 'Ba', 'Barium', 'ae', 727, 1845, 3.51, '#c8c8bc', { flame: '#9aff5a', fizz: 1, toxic: 1 }],
    [57, 'La', 'Lanthanum', 'ln', 920, 3464, 6.162, '#c4c6c0', {}],
    [58, 'Ce', 'Cerium', 'ln', 795, 3443, 6.77, '#c0bcb0', { flam: 0.2, ign: 160, flame: '#ffe8a0', phos: ['#ffe060', 40, 'yellow'], spark: '#ffe890' }], // the phosphor in white LEDs
    [59, 'Pr', 'Praseodymium', 'ln', 931, 3520, 6.77, '#b8bcae', { glass: ['#b8d860', 'yellow-green'] }],
    [60, 'Nd', 'Neodymium', 'ln', 1024, 3074, 7.01, '#bcbcb8', { glass: ['#a878e8', 'violet'], curie: 310, magnet: 1 }],
    [61, 'Pm', 'Promethium', 'ln', 1042, 3000, 7.26, '#c0c8c0', { heat: 0.02, rad: 0.003, glow: [0.15, '#9aff9a'] }],
    [62, 'Sm', 'Samarium', 'ln', 1072, 1794, 7.52, '#c0c0b8', { abs: 0.5, curie: 720, magnet: 1 }],
    [63, 'Eu', 'Europium', 'ln', 822, 1529, 5.264, '#c8c8c0', { abs: 0.4, phos: ['#ff3a30', 240, 'red'] }], // TV red, euro banknotes; a long afterglow
    [64, 'Gd', 'Gadolinium', 'ln', 1312, 3273, 7.9, '#c0c4c4', { abs: 0.9, curie: 19.5 }],
    [65, 'Tb', 'Terbium', 'ln', 1356, 3230, 8.23, '#c4c6c8', { phos: ['#6aff4a', 90, 'green'] }], // fluorescent-lamp green
    [66, 'Dy', 'Dysprosium', 'ln', 1407, 2567, 8.54, '#c4c4bc', { abs: 0.3, curie: -185 }],
    [67, 'Ho', 'Holmium', 'ln', 1461, 2720, 8.79, '#c8c8c4', {}],
    [68, 'Er', 'Erbium', 'ln', 1529, 2868, 9.066, '#c4c8cc', { glass: ['#ff8ab8', 'rose pink'] }],
    [69, 'Tm', 'Thulium', 'ln', 1545, 1950, 9.32, '#c8cacc', { phos: ['#4a7aff', 90, 'blue'] }], // the blue in euro banknotes
    [70, 'Yb', 'Ytterbium', 'ln', 819, 1196, 6.9, '#cccac0', {}],
    [71, 'Lu', 'Lutetium', 'ln', 1652, 3402, 9.841, '#c8ccd0', { phos: ['#8a90ff', 10, 'violet-blue'] }], // a scintillator: a brief flash per hit
    [72, 'Hf', 'Hafnium', 'tm', 2233, 4603, 13.31, '#bcbcc0', { abs: 0.6 }],
    [73, 'Ta', 'Tantalum', 'tm', 3017, 5458, 16.69, '#9aa0b0', { noble: 1, capacitor: 1 }],
    [74, 'W', 'Tungsten', 'tm', 3422, 5555, 19.25, '#8e9298', { ohm: [260, 2600], cond: 0.3 }],
    [75, 'Re', 'Rhenium', 'tm', 3186, 5596, 21.02, '#a0a4aa', {}],
    [76, 'Os', 'Osmium', 'tm', 3033, 5012, 22.59, '#8ea0b6', { noble: 1 }],
    [77, 'Ir', 'Iridium', 'tm', 2446, 4428, 22.56, '#d0d4d8', { noble: 1 }],
    [78, 'Pt', 'Platinum', 'tm', 1768.3, 3825, 21.45, '#d4d4d0', { noble: 1 }],
    [79, 'Au', 'Gold', 'tm', 1064.2, 2856, 19.3, '#e6c35c', { noble: 1, cond: 0.95, glass: ['#d42a50', 'ruby red'] }],
    [80, 'Hg', 'Mercury', 'tm', -38.8, 356.7, 13.534, '#c8ccd4', { toxic: 1, dis: '#9ad0ff', gl: 9, sc: -269 }],
    [81, 'Tl', 'Thallium', 'pt', 304, 1473, 11.85, '#a8aca8', { toxic: 1, flame: '#6aff6a' }],
    [82, 'Pb', 'Lead', 'pt', 327.5, 1749, 11.34, '#6e7480', { toxic: 1, abs: 0.2, shield: 1, sc: -266, acidRes: 0.995 }],
    [83, 'Bi', 'Bismuth', 'pt', 271.4, 1564, 9.78, '#c8a8c0', { seebeck: 1, dia: 1 }],
    [84, 'Po', 'Polonium', 'pt', 254, 962, 9.196, '#b0b8c0', { heat: 0.12, rad: 0.02, glow: [0.3, '#8ab4ff'], decay: [2e-5, 'Pb', 'a'] }],
    [85, 'At', 'Astatine', 'hal', 302, 337, 6.4, '#3a3a40', { powder: 1, corr: 0.05, heat: 0.1, rad: 0.02, decay: [2e-4, 'Bi', 'a'] }],
    [86, 'Rn', 'Radon', 'ng', -71, -61.7, 9.73, '#e8f0e8', { dis: '#ff4a6a', heat: 0.05, rad: 0.01, decay: [1e-4, 'Po', 'a'] }],
    [87, 'Fr', 'Francium', 'alk', 27, 677, 2.48, '#d8c890', { flam: 0.4, ign: 30, flame: '#ff4a8a', wr: [0.8, 4, 0.9], heat: 0.05, rad: 0.02, decay: [3e-4, 'Ra'] }],
    [88, 'Ra', 'Radium', 'ae', 700, 1737, 5.5, '#d8e8d8', { flame: '#ff3a3a', fizz: 1, heat: 0.02, rad: 0.01, glow: [0.5, '#9affc0'], decay: [1e-6, 'Rn', 'a'] }],
    [89, 'Ac', 'Actinium', 'an', 1050, 3198, 10.07, '#c8d0dc', { heat: 0.03, rad: 0.01, glow: [0.5, '#7ab0ff'], decay: [2e-5, 'Th'] }],
    [90, 'Th', 'Thorium', 'an', 1750, 4788, 11.72, '#9a9aa0', { rad: 0.0005 }],
    [91, 'Pa', 'Protactinium', 'an', 1572, 4000, 15.37, '#b0b0b4', { rad: 0.003, decay: [1e-6, 'Ac', 'a'] }],
    [92, 'U', 'Uranium', 'an', 1132.2, 4131, 19.1, '#6c7166', { heat: 0.0005, rad: 0.001, nem: 2e-5, fis: 0.08, glass: ['#c8f040', 'yellow-green that glows under radiation'] }],
    [93, 'Np', 'Neptunium', 'an', 644, 3902, 20.45, '#8a8e90', { heat: 0.005, rad: 0.003, nem: 1e-5, fis: 0.07 }],
    [94, 'Pu', 'Plutonium', 'an', 639.4, 3228, 19.816, '#7a6e6a', { heat: 0.01, rad: 0.003, nem: 1e-4, fis: 0.15 }],
    [95, 'Am', 'Americium', 'an', 1176, 2011, 12, '#b8b0a8', { heat: 0.02, rad: 0.005, fis: 0.06, decay: [1e-6, 'Np', 'a'] }],
    [96, 'Cm', 'Curium', 'an', 1340, 3110, 13.51, '#c8b8d8', { heat: 0.15, rad: 0.01, nem: 5e-4, fis: 0.1, glow: [0.4, '#c08aff'], decay: [2e-6, 'Pu', 'a'] }],
    [97, 'Bk', 'Berkelium', 'an', 986, 2627, 14.78, '#b8b8c0', { heat: 0.05, rad: 0.01, nem: 1e-4, fis: 0.08, decay: [1e-5, 'Am', 'a'] }],
    [98, 'Cf', 'Californium', 'an', 900, 1470, 15.1, '#c0c0c8', { heat: 0.1, rad: 0.01, nem: 5e-3, fis: 0.12, decay: [1e-5, 'Cm', 'a'] }],
    [99, 'Es', 'Einsteinium', 'an', 860, 996, 8.84, '#c8d8ff', { heat: 0.3, rad: 0.03, nem: 1e-3, fis: 0.1, glow: [0.5, '#8ab8ff'], decay: [1e-4, 'Bk', 'a'] }],
    [100, 'Fm', 'Fermium', 'an', 1527, 2500, 9.7, '#c0c4cc', { heat: 0.3, rad: 0.03, nem: 2e-3, decay: [3e-4, 'Cf', 'a'] }],
    [101, 'Md', 'Mendelevium', 'an', 827, 2500, 10.3, '#c4c4cc', { heat: 0.3, rad: 0.03, decay: [1e-3, 'Es', 'a'] }],
    [102, 'No', 'Nobelium', 'an', 827, 2500, 9.9, '#c8c4cc', { heat: 0.3, rad: 0.03, decay: [3e-3, 'Fm', 'a'] }],
    [103, 'Lr', 'Lawrencium', 'an', 1627, 2500, 15.6, '#c4c8d0', { heat: 0.3, rad: 0.03, decay: [5e-3, 'Md', 'a'] }],
    [104, 'Rf', 'Rutherfordium', 'sh', 2100, 5500, 23.2, '#b8bcc8', { decay: [5e-3, 'No', 'a'] }],
    [105, 'Db', 'Dubnium', 'sh', 2500, 5500, 29.3, '#b4b8c4', { decay: [4e-3, 'Lr', 'a'] }],
    [106, 'Sg', 'Seaborgium', 'sh', 2500, 5500, 35, '#b0b4c0', { decay: [8e-3, 'Rf', 'a'] }],
    [107, 'Bh', 'Bohrium', 'sh', 2500, 5500, 37.1, '#acb0bc', { decay: [8e-3, 'Db', 'a'] }],
    [108, 'Hs', 'Hassium', 'sh', 2500, 5500, 40.7, '#a8acb8', { decay: [1e-2, 'Sg', 'a'] }],
    [109, 'Mt', 'Meitnerium', 'sh', 2500, 5500, 37.4, '#a4a8b4', { decay: [1.5e-2, 'Bh', 'a'] }],
    [110, 'Ds', 'Darmstadtium', 'sh', 2500, 5500, 34.8, '#a0a4b0', { decay: [2e-2, 'Hs', 'a'] }],
    [111, 'Rg', 'Roentgenium', 'sh', 2500, 5500, 28.7, '#c8b890', { decay: [2e-2, 'Mt', 'a'] }],
    [112, 'Cn', 'Copernicium', 'sh', 10, 67, 14, '#b8c0c8', { decay: [1e-2, 'Ds', 'a'] }],
    [113, 'Nh', 'Nihonium', 'sh', 430, 1130, 16, '#b0b8b8', { decay: [1e-2, 'Rg', 'a'] }],
    [114, 'Fl', 'Flerovium', 'sh', -73, 107, 11.4, '#b8b8c0', { decay: [1e-2, 'Cn', 'a'] }],
    [115, 'Mc', 'Moscovium', 'sh', 400, 1100, 13.5, '#b0b4bc', { decay: [2e-2, 'Nh', 'a'] }],
    [116, 'Lv', 'Livermorium', 'sh', 435, 812, 12.9, '#acb0b8', { decay: [3e-2, 'Fl', 'a'] }],
    [117, 'Ts', 'Tennessine', 'sh', 450, 610, 7.2, '#585060', { decay: [3e-2, 'Mc', 'a'] }],
    [118, 'Og', 'Oganesson', 'sh', 52, 177, 7.2, '#c8c8d0', { decay: [5e-2, 'Lv', 'a'] }],
  ];

  const FAMILY = {
    alk: 'Alkali metal', ae: 'Alkaline earth metal', tm: 'Transition metal', pt: 'Post-transition metal',
    md: 'Metalloid', nm: 'Nonmetal', hal: 'Halogen', ng: 'Noble gas', ln: 'Lanthanide', an: 'Actinide',
    sh: 'Superheavy element',
  };
  const METALLIC = new Set(['alk', 'ae', 'tm', 'pt', 'ln', 'an', 'sh']);
  // Metals above hydrogen in the reactivity series: acid dissolves them with a fizz of hydrogen.
  // Copper, silver, gold, the platinum metals, mercury and bismuth don't; niobium, tantalum,
  // hafnium and zirconium hide behind an oxide skin.
  const ACID_H = new Set(['Li', 'Na', 'K', 'Rb', 'Cs', 'Fr', 'Be', 'Mg', 'Ca', 'Sr', 'Ba', 'Ra', 'Al', 'Sc', 'Ti', 'V',
    'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Zn', 'Ga', 'Y', 'Cd', 'In', 'Sn', 'Tl', 'Pb', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm',
    'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Ac', 'Th', 'U', 'Np', 'Pu', 'Am']);
  // What each element does on contact, beyond its family's habits (see periodic() in sim.js).
  const TRICKS = {
    H: 'a spark sets it off, and oxygen makes the bang bigger',
    P: 'safe under water; in open air it warms itself until it bursts into flame',
    Mg: 'burns on in carbon dioxide and turns water into hydrogen',
    Al: 'bromine sets it alight; iodine does too, with a drop of water; molten gallium makes it crumble',
    Cl: 'bleaches flowers white',
    Br: 'sets aluminium alight',
    I: 'with aluminium and a drop of water, erupts in purple vapour',
    Ga: 'molten, it makes aluminium crumble',
    Zr: 'red-hot, it splits steam into hydrogen; past 1,100°C it burns brilliant white',
    Pd: 'soaks up hydrogen and lets it go when heated',
    Pt: 'warms up and lights hydrogen and methane without a flame',
    Au: 'dissolves in mercury, and comes back when the mercury boils off',
    Hg: 'dissolves gold',
    // electrical devices (see electric() and powerSource() in sim.js)
    C: 'two pieces with a small gap between them strike an arc when current flows; neutrons that cross it slow down and split uranium far more easily (a graphite moderator)',
    Be: 'bounces neutrons back into a reactor core (a reflector), and radiation striking it knocks neutrons out',
    Ca: 'fired fast or white-hot into an actinide, it fuses into a superheavy element, the way elements 112 to 118 were made',
    Th: 'glows brilliant white in a flame, like the mantle of a gas lamp',
    O: 'liquid oxygen clings to a magnet',
    W: 'glows white-hot with current, a light bulb filament, but burns out in air: seal it in glass with argon',
    Mo: 'glows with current like tungsten, and burns out in air the same way',
    Ni: 'touching chromium, glows red-hot with current (nichrome, the wire in a toaster)',
    Cr: 'touching nickel, glows red-hot with current (nichrome)',
    Zn: 'with copper in saltwater or acid it makes current: a lemon battery',
    Pb: 'stands up to acid, and standing in acid it makes current, as in a car battery',
    Si: 'makes current in light, under open sky or by a fire: a solar cell',
    Te: 'makes current when one side is hot and the other cold',
    Bi: 'makes current when one side is hot and the other cold',
    Ta: 'stores current and lets it all go in one spark: a capacitor',
    Ti: 'red-hot in air, it throws white sparks like a sparkler',
    Ce: 'struck, dropped hard or caught in a blast, it throws sparks that light fuel: a lighter flint',
  };
  // a few tricks extend a note that's already there
  const MORE = {
    Fe: 'red-hot in air it throws sparks and burns to rust',
    Mg: 'burning, it throws white sparks',
    Al: 'a cloud of its dust flashes in a fire',
    Cu: 'with zinc in saltwater or acid it makes current: a lemon battery',
    Bi: 'magnets push it away',
  };
  // Calcium-48 fired into an actinide target: the reactions that made elements 112 to 118
  const FUSE = { U: 'Cn', Np: 'Nh', Pu: 'Fl', Am: 'Mc', Cm: 'Lv', Bk: 'Ts', Cf: 'Og' };
  const NAMES = Object.fromEntries(T.map((e) => [e[1], e[2]]));

  // Standard table position: [row, column]; rows 9 and 10 hold the lanthanides and actinides.
  function position(z) {
    if (z === 1) return [1, 1];
    if (z === 2) return [1, 18];
    if (z <= 10) return [2, z <= 4 ? z - 2 : z + 8];
    if (z <= 18) return [3, z <= 12 ? z - 10 : z];
    if (z <= 36) return [4, z - 18];
    if (z <= 54) return [5, z - 36];
    if (z >= 57 && z <= 71) return [9, z - 54];
    if (z >= 89 && z <= 103) return [10, z - 86];
    if (z <= 86) return [6, z <= 56 ? z - 54 : z - 68];
    return [7, z <= 88 ? z - 86 : z - 100];
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  const fmt = (v) => `${Math.round(v).toLocaleString('en-US')}°C`;

  const defs = T.map(([z, sym, name, fam, mp, bp, dens, color, x]) => {
    const gasAtRoom = bp <= 20;
    const metallic = METALLIC.has(fam);
    // solids are granules, so pellets fall into water and sink or float by real density
    const cat = gasAtRoom ? CAT.GAS : mp <= 20 ? CAT.LIQUID : CAT.POWDER;
    // condensed density (×10 to match the game's water = 10); liquefied gases are ~0.7 g/mL per g/L·1000
    const condensed = gasAtRoom ? dens * 0.7 : dens;
    const gl = x.gl || (gasAtRoom ? dens : 0);

    const notes = [];
    if (x.wr) notes.push('explodes in water');
    if (x.fizz) notes.push('fizzes in water');
    if (x.corr) notes.push('corrosive');
    if (x.fis) notes.push('fissile: a big lump goes critical');
    if (x.nem && !x.fis) notes.push('emits neutrons');
    if (x.abs) notes.push('absorbs neutrons');
    if (x.decay || x.rad) notes.push('radioactive');
    if (x.dis) notes.push('glows when electrified');
    if (x.phos) notes.push(`glows ${x.phos[2]} under current or radiation`);
    if (ACID_H.has(sym)) notes.push('fizzes hydrogen in acid');
    if (fam === 'alk') notes.push('burns to salt with a halogen');
    if (x.oxid) notes.push('feeds fire');
    if (x.toxic) notes.push('toxic');
    if (x.noble) notes.push('resists acid');
    if (x.flame) notes.push('coloured flame');
    if (sym === 'H') notes.push('burns to water');
    if (sym === 'C') notes.push('turns to diamond sealed at 2500°C');
    if (sym === 'Fe') notes.push('rusts in water');
    if (sym === 'Al') notes.push('makes thermite with rust');
    if (TRICKS[sym]) notes.push(TRICKS[sym]);
    if (MORE[sym]) notes.push(MORE[sym]);
    if (x.glass) notes.push(`turns molten glass ${x.glass[1]}`);
    if (x.sc) notes.push(`superconducts below ${fmt(x.sc)}: current races through it without heating it`);
    if (x.magnet) notes.push(`a permanent magnet below ${fmt(x.curie)}: it pulls iron, cobalt and nickel`);
    else if (x.curie) notes.push(`magnetic below ${fmt(x.curie)}${sym === 'Fe' || sym === 'Co' || sym === 'Ni' ? '; carrying current, it becomes an electromagnet' : ''}`);
    if (FUSE[sym]) notes.push(`struck by fast calcium, it fuses into ${NAMES[FUSE[sym]].toLowerCase()}`);
    const said = notes.join(', ');

    const d = {
      key: 'el_' + sym.toLowerCase(), name, sym, z, fam, family: FAMILY[fam], periodic: true,
      group: 'Periodic', cat, render: R.PERIODIC,
      colors: [color, shade(color, 1.08), shade(color, 0.92), shade(color, 0.85)],
      mp, bp, gl, gasColor: x.gas || null, liqColor: x.liq || null,
      flameColor: x.flame || null, dischargeColor: x.dis || null,
      blastColor: x.blast || (x.fis ? '#f0f4ff' : null), blastGlow: x.blastGlow || (x.fis ? 1 : 0), // fission: a blinding white flash
      density: Math.max(0.5, condensed * 10),
      gdens: gl ? gl * 0.33 : 0.35,
      cond: x.cond || (metallic ? 0.7 : fam === 'md' ? 0.3 : gasAtRoom ? 0.05 : 0.12),
      conduct: !!(x.conduct || metallic || fam === 'ng' || sym === 'N'),
      acidRes: x.acidRes || (x.noble ? 0.97 : gasAtRoom || fam === 'hal' ? 1 : metallic ? 0.4 : 0.2),
      blastRes: gasAtRoom ? 0 : metallic ? (dens > 15 ? 0.85 : 0.7) : 0.2,
      flam: x.flam || 0, ign: x.ign, burn: x.burn || (x.flam ? [40, 80] : undefined),
      burnTemp: x.burnTemp || (x.flam ? 900 : 0), fireEmit: x.fireEmit || (x.flam ? 0.3 : 0),
      burnInto: x.burnInto || (x.flam ? [['ash', 1]] : undefined), explode: x.explode,
      waterproof: !!x.waterproof, needAir: !x.explode, slide: metallic ? 0.35 : 0.7, disp: 3, visc: 0.85,
      emit: x.glow ? x.glow[0] : 0, glowColor: x.glow ? x.glow[1] : null,
      chem: {
        wr: x.wr || null, fizz: !!x.fizz, corr: x.corr || 0, toxic: !!x.toxic, oxid: !!x.oxid,
        heat: x.heat || 0, rad: x.rad || 0, nem: x.nem || 0, fis: x.fis || 0, abs: x.abs || 0,
        decay: x.decay || null, rusts: !!x.rusts, shield: !!x.shield,
        phos: x.phos || null, acidH: ACID_H.has(sym),
        glass: x.glass ? x.glass[0] : null, ohm: x.ohm || null, solar: !!x.solar, seebeck: !!x.seebeck,
        capacitor: !!x.capacitor, sc: x.sc || 0, spark: x.spark || null,
        curie: x.curie === undefined ? null : x.curie, magnet: !!x.magnet, dia: !!x.dia, para: !!x.para,
        fuse: FUSE[sym] || null,
      },
      phosColor: x.phos ? x.phos[0] : null,
      glassColor: x.glass ? x.glass[0] : null, sparkColor: x.spark || null,
      pos: position(z),
      desc: `Melts ${fmt(mp)}, boils ${fmt(bp)}.${said ? ` ${said[0].toUpperCase()}${said.slice(1)}.` : ''}`,
    };
    if (sym === 'C') d.hi = [2500, 'diamond', 0.01];
    return d;
  });

  G.ELEM.extend(defs);
  G.ELEM.FAMILY = FAMILY;
  G.ELEM.periodic = defs;

  // Solid forms, cast the way real metal is: melt the loose powder past its melting point and let it
  // cool, and it sets into a solid block that stands where it is (see periodic() in sim.js). Each one
  // is found the first time it is cast, joins the Solids, does what its metal does (conducts, holds a
  // magnet, glows as a filament, splits) and melts back into the liquid metal at the same melting
  // point. Only these: there are not type slots enough for every element.
  const CAST = ['Mg', 'Al', 'Si', 'Ti', 'Cr', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Zr', 'Mo', 'Ag', 'Sn', 'Nd', 'Sm', 'W', 'Pt', 'Au', 'Pb', 'Bi', 'U'];
  // the ones with a catch: any gas counts as air for burning, so magnesium (alight at 600°C, molten
  // at 650°C) has to be packed in with no gas at all, and a white-hot filament metal burns away in
  // air long before it melts
  const HOW = {
    Mg: ['Magnesium melted in a sealed capsule packed full, and left to cool',
      'Pack magnesium into a sealed capsule with no room for air, then melt it: in the open it catches fire first.'],
    Mo: ['Molybdenum melted sealed in argon, and left to cool', 'Melt molybdenum sealed in argon: in open air it burns away before it melts.'],
    W: ['Tungsten melted sealed in argon, and left to cool', 'Melt tungsten sealed in argon: in open air it burns away before it melts.'],
  };
  const solids = CAST.map((sym) => {
    const p = defs.find((d) => d.sym === sym), name = p.name.toLowerCase();
    const how = HOW[sym] || [`${p.name} melted past ${fmt(p.mp)} and left to cool`,
      `Melt ${name} past ${fmt(p.mp)}${p.mp >= 1000 ? ' on a floor of Wall (stone melts first)' : ''} and let it cool: it sets solid.`];
    return {
      key: 'solid_' + sym.toLowerCase(), name: `Solid ${name}`, group: 'Solids', cat: CAT.STATIC, render: R.METAL, castOf: p.key,
      colors: [p.colors[0], shade(p.colors[0], 1.12), shade(p.colors[0], 0.9), shade(p.colors[0], 1.22)],
      density: p.density, cond: Math.max(p.cond, 0.5), conduct: p.conduct, acidRes: p.acidRes, blastRes: METALLIC.has(p.fam) ? 0.8 : 0.4,
      hi: [p.mp, p.key, 1],
      desc: `Cast ${name}: a solid block that stays where you put it. Melts back into liquid ${name} at ${fmt(p.mp)}.`,
      recipe: how[0], hint: how[1],
      from: [p.key],
    };
  });
  G.ELEM.extend(solids);
  for (const s of solids) { // each solid knows its metal, and each metal its solid
    s.castOf = G.ELEM.byKey[s.castOf].id;
    G.ELEM.list[s.castOf].castTo = s.id;
  }
})(globalThis);
