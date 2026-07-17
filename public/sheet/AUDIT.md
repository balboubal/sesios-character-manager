# Workbook Conversion Audit

Source: `Amutsu Character Sheet.xlsx`

## Worksheet inventory

| Worksheet | Used range | Formula cells | Literal cells | Validations | Conditional formats | Notes | Tables | Images |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Character Sheet | A1:AM1002 | 723 | 900 | 11 | 18 | 91 | 4 | 0 |
| Personality Traits | A1:D45 | 0 | 169 | 0 | 0 | 0 | 0 | 0 |
| Data | A1:Z29 | 49 | 382 | 0 | 0 | 0 | 2 | 0 |
| Items | A1:Y269 | 13 | 6561 | 3 | 1 | 0 | 1 | 0 |
| Food Catalogue | A1:H17 | 0 | 99 | 0 | 0 | 0 | 0 | 0 |
| Crafting Catalogue | A1:D112 | 0 | 264 | 0 | 0 | 0 | 14 | 1 |

No worksheet, row, or column is hidden. No protected range, chart, macro, or Apps Script file is present in the supplied source.

## Named ranges

- `ItemPHYDMG` → `'Character Sheet'!$J$11:$J$18`
- `ItemFOC` → `'Character Sheet'!$X$11:$X$18`
- `ItemSTR` → `'Character Sheet'!$M$11:$M$18`
- `TAL` → `'Character Sheet'!$B$8`
- `ItemDRB` → `'Character Sheet'!$W$11:$W$18`
- `VITMOD` → `'Character Sheet'!$C$5`
- `ItemSPD` → `'Character Sheet'!$N$11:$N$18`
- `BEVA` → `'Character Sheet'!$F$21`
- `Rolls` → `'Character Sheet'!$AE$5`
- `BRES` → `'Character Sheet'!$B$25`
- `INTMOD` → `'Character Sheet'!$C$6`
- `STR` → `'Character Sheet'!$B$3`
- `BHP` → `'Character Sheet'!$B$22`
- `ItemTAL` → `'Character Sheet'!$R$11:$R$18`
- `PROFMOD` → `'Character Sheet'!$B$13`
- `ItemAC` → `'Character Sheet'!$T$11:$T$18`
- `ItemDMGREF` → `'Character Sheet'!$Z$11:$Z$18`
- `ItemMAGDMG` → `'Character Sheet'!$K$11:$K$18`
- `SPDMOD` → `'Character Sheet'!$C$4`
- `AWR` → `'Character Sheet'!$B$7`
- `ItemXpMulti` → `'Character Sheet'!$AB$11:$AB$18`
- `ItemCRC` → `'Character Sheet'!$L$11:$L$18`
- `ItemINT` → `'Character Sheet'!$P$11:$P$18`
- `ItemHPREG` → `'Character Sheet'!$Y$11:$Y$18`
- `SpellCastingMOD` → `'Character Sheet'!$I$47`
- `ItemEVA` → `'Character Sheet'!$V$11:$V$18`
- `ClassTable` → `Data!$F$2:$M$14`
- `BAC` → `'Character Sheet'!$B$24`
- `SPD` → `'Character Sheet'!$B$4`
- `BSPELLDMG` → `'Character Sheet'!$B$23`
- `ItemGoldMulti` → `'Character Sheet'!$AA$11:$AA$18`
- `BMOVSPD` → `'Character Sheet'!$F$25`
- `ItemLUCK` → `'Character Sheet'!$S$11:$S$18`
- `BCRC` → `'Character Sheet'!$F$23`
- `ItemVIT` → `'Character Sheet'!$O$11:$O$18`
- `BPHYDMG` → `'Character Sheet'!$B$21`
- `ItemRES` → `'Character Sheet'!$U$11:$U$18`
- `ItemAWR` → `'Character Sheet'!$Q$11:$Q$18`
- `ItemTable` → `Items!$A$1:$Y$1000`
- `LVL` → `'Character Sheet'!$B$11`
- `STRMOD` → `'Character Sheet'!$C$3`
- `INT` → `'Character Sheet'!$B$6`
- `VIT` → `'Character Sheet'!$B$5`
- `BFOCUS` → `'Character Sheet'!$F$22`
- `AWRMOD` → `'Character Sheet'!$C$7`
- `TALMOD` → `'Character Sheet'!$C$8`
- `BMANA` → `'Character Sheet'!$F$24`

## Source input areas

- Character identity and appearance: `H2:I7`, `K2`, `M2`, `O2`, `Q2`.
- Ability bonuses and personality traits: `D3:D8`, `E3:F8`.
- Level, current pools, alignment, sanctum, faith, and bonus statistics: `B11`, `C12`, `F13`, `C15`, `C18`, `B21:F25`.
- Currency, jewelry, gems, active effects, and special effects: `H22:K22`, `I24:I27`, `K24:K27`, `M21:S27`, `X21:AB21`, `U23:AB24`, `U26:AB27`.
- Skill proficiencies and bonuses: `C28:D32`, `C34:D42`, `C44:D46`, `C48:D75`, `C77:D98`, `C100:D114`.
- Saving-throw proficiencies and bonuses: `E33:F33`, `E37:F37`, `E41:F41`, `E45:F45`, `E49:F49`, `E53:F53`.
- Inventory: `H29:H42`, `N29:N42`, `AB29:AB42`, plus the literal weight override in `L32`.
- Spellcasting ability and spell records: `I46`, plus spell fields in `H:W` for rows `51:59`, `62:78`, `81:95`, `98:112`, `115:129`, `132:146`, `149:159`, `162:168`, `171:177`, and `180:186`.
- Damage tool: `AE2:AE5`, `AF7:AF13`.
- Hunger inputs: `AE21`, `AE26:AG55`.
- Hearth inputs: `AE58`, `AD62:AH81`, `AK62:AK75`.
- Item rarity and numeric catalog fields: `Items!B2:B269`, `Items!F2:F269`, `Items!Q2:X269`.

The website additionally exposes equipment item names as controlled selects. In the source they are constant formula cells (`I11:I18`), but their lookup dependencies are preserved exactly.

## Calculated cells

Total formula cells: **785**.

### Character Sheet

`B3`, `C3`, `B4`, `C4`, `B5`, `C5`, `B6`, `C6`, `B7`, `C7`, `AG7`, `AH7`, `B8`, `C8`, `AG8`, `AH8`, `F9`, `AG9`, `AH9`, `AG10`, `AH10`, `F11`, `I11`, `J11`, `K11`, `L11`, `M11`, `N11`, `O11`, `P11`, `Q11`, `R11`, `S11`, `T11`, `U11`, `V11`, `W11`, `X11`, `Y11`, `Z11`, `AA11`, `AB11`, `AG11`, `AH11`, `B12`, `F12`, `I12`, `J12`, `K12`, `L12`, `M12`, `N12`, `O12`, `P12`, `Q12`, `R12`, `S12`, `T12`, `U12`, `V12`, `W12`, `X12`, `Y12`, `Z12`, `AA12`, `AB12`, `AG12`, `AH12`, `B13`, `I13`, `J13`, `K13`, `L13`, `M13`, `N13`, `O13`, `P13`, `Q13`, `R13`, `S13`, `T13`, `U13`, `V13`, `W13`, `X13`, `Y13`, `Z13`, `AA13`, `AB13`, `AG13`, `AH13`, `B14`, `F14`, `I14`, `J14`, `K14`, `L14`, `M14`, `N14`, `O14`, `P14`, `Q14`, `R14`, `S14`, `T14`, `U14`, `V14`, `W14`, `X14`, `Y14`, `Z14`, `AA14`, `AB14`, `B15`, `F15`, `I15`, `J15`, `K15`, `L15`, `M15`, `N15`, `O15`, `P15`, `Q15`, `R15`, `S15`, `T15`, `U15`, `V15`, `W15`, `X15`, `Y15`, `Z15`, `AA15`, `AB15`, `AF15`, `B16`, `F16`, `I16`, `J16`, `K16`, `L16`, `M16`, `N16`, `O16`, `P16`, `Q16`, `R16`, `S16`, `T16`, `U16`, `V16`, `W16`, `X16`, `Y16`, `Z16`, `AA16`, `AB16`, `B17`, `F17`, `I17`, `J17`, `K17`, `L17`, `M17`, `N17`, `O17`, `P17`, `Q17`, `R17`, `S17`, `T17`, `U17`, `V17`, `W17`, `X17`, `Y17`, `Z17`, `AA17`, `AB17`, `B18`, `F18`, `I18`, `J18`, `K18`, `L18`, `M18`, `N18`, `O18`, `P18`, `Q18`, `R18`, `S18`, `T18`, `U18`, `V18`, `W18`, `X18`, `Y18`, `Z18`, `AA18`, `AB18`, `AE18`, `AF18`, `B19`, `F19`, `I20`, `AG21`, `AI21`, `AE22`, `AH26`, `AI26`, `AJ26`, `F27`, `AH27`, `AI27`, `AJ27`, `B28`, `F28`, `AH28`, `AI28`, `AJ28`, `B29`, `F29`, `I29`, `J29`, `K29`, `L29`, `M29`, `AH29`, `AI29`, `AJ29`, `B30`, `I30`, `J30`, `K30`, `L30`, `M30`, `AH30`, `AI30`, `AJ30`, `B31`, `F31`, `I31`, `J31`, `K31`, `L31`, `M31`, `AH31`, `AI31`, `AJ31`, `B32`, `I32`, `J32`, `K32`, `M32`, `AH32`, `AI32`, `AJ32`, `I33`, `J33`, `K33`, `L33`, `M33`, `AH33`, `AI33`, `AJ33`, `B34`, `I34`, `J34`, `K34`, `L34`, `M34`, `AH34`, `AI34`, `AJ34`, `B35`, `F35`, `I35`, `J35`, `K35`, `L35`, `M35`, `AH35`, `AI35`, `AJ35`, `B36`, `I36`, `J36`, `K36`, `L36`, `M36`, `AH36`, `AI36`, `AJ36`, `B37`, `H37`, `I37`, `J37`, `K37`, `L37`, `M37`, `S37`, `U37`, `W37`, `AH37`, `AI37`, `AJ37`, `B38`, `H38`, `I38`, `J38`, `K38`, `L38`, `M38`, `AH38`, `AI38`, `AJ38`, `B39`, `F39`, `H39`, `I39`, `J39`, `K39`, `L39`, `M39`, `AH39`, `AI39`, `AJ39`, `B40`, `I40`, `J40`, `K40`, `L40`, `M40`, `AH40`, `AI40`, `AJ40`, `B41`, `H41`, `I41`, `J41`, `K41`, `L41`, `M41`, `AH41`, `AI41`, `AJ41`, `B42`, `H42`, `I42`, `J42`, `K42`, `L42`, `M42`, `AH42`, `AI42`, `AJ42`, `F43`, `L43`, `M43`, `AH43`, `AI43`, `AJ43`, `B44`, `AH44`, `AI44`, `AJ44`, `B45`, `AH45`, `AI45`, `AJ45`, `B46`, `M46`, `AH46`, `AI46`, `AJ46`, `F47`, `I47`, `M47`, `AH47`, `AI47`, `AJ47`, `B48`, `AH48`, `AI48`, `AJ48`, `B49`, `AH49`, `AI49`, `AJ49`, `B50`, `AH50`, `AI50`, `AJ50`, `B51`, `F51`, `AH51`, `AI51`, `AJ51`, `B52`, `AH52`, `AI52`, `AJ52`, `B53`, `AH53`, `AI53`, `AJ53`, `B54`, `AH54`, `AI54`, `AJ54`, `B55`, `AH55`, `AI55`, `AJ55`, `B56`, `B57`, `B58`, `AG58`, `AI58`, `B59`, `AE59`, `B60`, `B61`, `B62`, `AI62`, `AJ62`, `AL62`, `AM62`, `B63`, `AI63`, `AJ63`, `AL63`, `AM63`, `B64`, `AI64`, `AJ64`, `AL64`, `AM64`, `B65`, `AJ65`, `AL65`, `AM65`, `B66`, `AE66`, `AI66`, `AJ66`, `AL66`, `AM66`, `B67`, `AE67`, `AI67`, `AJ67`, `AL67`, `AM67`, `B68`, `AE68`, `AI68`, `AJ68`, `AL68`, `AM68`, `B69`, `AE69`, `AI69`, `AJ69`, `AL69`, `AM69`, `B70`, `AE70`, `AI70`, `AJ70`, `AL70`, `AM70`, `B71`, `AE71`, `AI71`, `AJ71`, `AL71`, `AM71`, `B72`, `AE72`, `AI72`, `AJ72`, `AL72`, `AM72`, `B73`, `AE73`, `AI73`, `AJ73`, `AL73`, `AM73`, `B74`, `AE74`, `AI74`, `AJ74`, `AL74`, `AM74`, `B75`, `AE75`, `AI75`, `AJ75`, `AL75`, `AM75`, `AE76`, `AI76`, `B77`, `AE77`, `AI77`, `B78`, `AE78`, `AI78`, `B79`, `AE79`, `AI79`, `B80`, `AE80`, `AI80`, `B81`, `AE81`, `AI81`, `B82`, `B83`, `B84`, `B85`, `B86`, `B87`, `B88`, `B89`, `B90`, `B91`, `B92`, `B93`, `B94`, `B95`, `B96`, `B97`, `B98`, `B100`, `B101`, `B102`, `B103`, `B104`, `B105`, `B106`, `B107`, `B108`, `B109`, `B110`, `B111`, `B112`, `B113`, `B114`, `E228`, `E229`, `E230`, `E231`, `E232`, `E233`, `E238`, `F238`, `E239`, `F239`, `E240`, `F240`, `E241`, `F241`, `E242`, `F242`, `E244`, `F244`, `E245`, `F245`, `E246`, `F246`, `E247`, `F247`, `E248`, `F248`, `E249`, `F249`, `E250`, `F250`, `E251`, `F251`, `E252`, `F252`, `E254`, `F254`, `E255`, `F255`, `E256`, `F256`, `E258`, `F258`, `E259`, `F259`, `E260`, `F260`, `E261`, `F261`, `E262`, `F262`, `E263`, `F263`, `E264`, `F264`, `E265`, `F265`, `E266`, `F266`, `E267`, `F267`, `E268`, `F268`, `E269`, `F269`, `E270`, `F270`, `E271`, `F271`, `E272`, `F272`, `E273`, `F273`, `E274`, `F274`, `E275`, `F275`, `E276`, `F276`, `E277`, `F277`, `E278`, `F278`, `E279`, `F279`, `E280`, `F280`, `E281`, `F281`, `E282`, `F282`, `E283`, `F283`, `E284`, `F284`, `E285`, `F285`, `E287`, `F287`, `E288`, `F288`, `E289`, `F289`, `E290`, `F290`, `E291`, `F291`, `E292`, `F292`, `E293`, `F293`, `E294`, `F294`, `E295`, `F295`, `E296`, `F296`, `E297`, `F297`, `E298`, `F298`, `E299`, `F299`, `E300`, `F300`, `E301`, `F301`, `E302`, `F302`, `E303`, `F303`, `E304`, `F304`, `E305`, `F305`, `E306`, `F306`, `E307`, `F307`, `E308`, `F308`, `E310`, `F310`, `E311`, `F311`, `E312`, `F312`, `E313`, `F313`, `E314`, `F314`, `E315`, `F315`, `E316`, `F316`, `E317`, `F317`, `E318`, `F318`, `E319`, `F319`, `E320`, `F320`, `E321`, `F321`, `E322`, `F322`, `E323`, `F323`, `E324`, `F324`

### Personality Traits

None.

### Data

`G3`, `H3`, `I3`, `J3`, `K3`, `L3`, `M3`, `G6`, `H6`, `I6`, `J6`, `K6`, `L6`, `M6`, `G7`, `H7`, `I7`, `J7`, `K7`, `L7`, `M7`, `G8`, `H8`, `I8`, `J8`, `K8`, `L8`, `M8`, `G9`, `H9`, `I9`, `J9`, `K9`, `L9`, `M9`, `G11`, `H11`, `I11`, `J11`, `K11`, `L11`, `M11`, `G13`, `H13`, `I13`, `J13`, `K13`, `L13`, `M13`

### Items

`A2`, `I261`, `J261`, `K261`, `L261`, `M261`, `O261`, `I262`, `J262`, `K262`, `L262`, `M262`, `O262`

### Food Catalogue

None.

### Crafting Catalogue

None.

## Source anomalies preserved

- Character Sheet B8 sums ItemAWR instead of the defined ItemTAL range.
- Data I13 calculates Rogue resistance from ItemAC and BAC instead of resistance ranges.
- Character Sheet AJ37 uses hunger-tracker references that do not match adjacent rows.
- Character Sheet AF18 compares a 0–99 roll against a fractional critical chance.
- Character Sheet B15, B16, B17, B18, and B19 add bonuses already included by several class-table formulas.
- Character Sheet E228:E233 can produce a numeric error when an ability score is below 30.
- Two FILTER formulas were exported through an Excel compatibility wrapper; their intended INDEX/FILTER behavior is implemented directly.
