# Homey Badkamer Afzuiging

HomeyScript dat de badkamerafzuiging automatisch aan- en uitzet op basis van de luchtvochtigheid.

**Huidige versie:** 1.3.0, zie het wijzigingslog bovenaan `badkamer_afzuiging.js`.

## Wat het doet

- **Twee sensoren in de badkamer (optioneel):** aanzetten gebeurt op de snelste stijging; het vangnet, het uitzetten en de voortgangscontrole gebruiken de **laagste** waarde. Zo houdt één natte sensor vlak bij de douche de afzuiging niet voor de gek. Laat `NAAM_BADKAMER_2` leeg om maar één sensor te gebruiken.
- **Aan bij douchen:** de vochtigheid stijgt ≥ 4% binnen 5 minuten, of alle badkamersensoren zijn ≥ 12% vochtiger dan de slaapkamer (vangnet).
- **Uit als het droog is:** vochtigheid ≤ slaapkamer + 3%, na minimaal 10 minuten draaien.
- **Handmatig aanzetten wordt gerespecteerd:** na een druk op de schakelaar draait de afzuiging minimaal 20 minuten en daarna tot het droog is.
- **Langer doordraaien zolang het helpt:** na 2 uur blijft de afzuiging alleen draaien als de vochtigheid nog ≥ 2% per 30 minuten daalt. Absolute stop na 6 uur.
- **Kritieke melding** alleen als de vochtigheid na 45 minuten afzuigen nog ≥ 90% is, of als de afzuiging uit staat.
- **Waarschuwing bij een verouderde sensor:** een sensor heeft al 3 uur geen nieuwe waarde gestuurd, bijvoorbeeld door een lege batterij.

## Benodigd

| Apparaat in Homey | Rol |
|---|---|
| `Thermometer Badkamer` | vochtigheid badkamer |
| `Badkamer - Slimme Radiatorknop` | tweede vochtsensor badkamer (optioneel) |
| `Thermometer Slaapkamer` | referentievochtigheid |
| `Afzuiging badkamer` | stekker/schakelaar van de afzuiging |

Pas de namen bovenaan het script aan als jouw apparaten anders heten. Vul bij `NAAM_BEHEERDER` je eigen Homey-gebruikersnaam in; die persoon krijgt de pushberichten.

## Installatie

1. Maak in Homey onder **HomeyScript** een script `Badkamer afzuiging` aan en plak de inhoud van `badkamer_afzuiging.js` erin.
2. Maak een flow met als trigger **Elke 1 minuut** en als actie **HomeyScript → Voer script uit → Badkamer afzuiging**.

De flow moet elke minuut draaien, omdat de timers (minimale draaitijd, voortgangscontrole en maximale draaitijd) daarop leunen.

## Instellingen

Alle drempels en tijden staan als constanten bovenaan het script, onder `// --- CONFIGURATIE ---`.

## Versienummering

`MAJOR.MINOR.PATCH`:

- **MAJOR:** de werking of logica verandert.
- **MINOR:** er komt een nieuwe functie bij.
- **PATCH:** een bugfix, of alleen een instelling aangepast.

Verhoog bij elke wijziging `const VERSIE` en zet een regel in het wijzigingslog. Na het plakken van een nieuwe versie meldt het script de versiewissel één keer in de Homey-tijdlijn. De draaiende versie staat in de logicavariabele `BadkamerScriptVersie` en in de tag `Badkamer_Script_Versie`.
