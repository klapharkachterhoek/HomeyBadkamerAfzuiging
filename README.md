# Homey Badkamer Afzuiging

HomeyScript dat de badkamerafzuiging automatisch aan- en uitzet op basis van de luchtvochtigheid.

**Huidige versie:** 1.2.0, zie het wijzigingslog bovenaan `badkamer_afzuiging.js`.

## Wat het doet

- **Aan bij douchen:** de vochtigheid stijgt ≥ 4% binnen 5 minuten, of de badkamer is ≥ 12% vochtiger dan de slaapkamer (vangnet).
- **Uit als het droog is:** vochtigheid ≤ slaapkamer + 3%, na minimaal 10 minuten draaien.
- **Handmatig aanzetten wordt gerespecteerd:** na een druk op de schakelaar draait de afzuiging minimaal 20 minuten en daarna tot het droog is.
- **Langer doordraaien zolang het helpt:** na 2 uur blijft de afzuiging alleen draaien als de vochtigheid nog ≥ 2% per 30 minuten daalt. Absolute stop na 6 uur.
- **Kritieke melding** alleen als de vochtigheid na 45 minuten afzuigen nog ≥ 90% is, of als de afzuiging uit staat.
- **Waarschuwing bij een verouderde sensor:** de thermometer heeft al een uur geen nieuwe waarde gestuurd, bijvoorbeeld door een lege batterij.

## Benodigd

| Apparaat in Homey | Rol |
|---|---|
| `Thermometer Badkamer` | vochtigheid badkamer |
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
