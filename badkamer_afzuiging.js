// =====================================================================
//  Badkamer Afzuiging
//  Draait elke minuut via de flow "Badkamer ventilatie".
//
//  Versienummering (MAJOR.MINOR.PATCH):
//    MAJOR = andere werking/logica   MINOR = nieuwe functie
//    PATCH = bugfix of alleen instellingen aangepast
//
//  Wijzigingslog:
//    1.3.0  2026-11-25  Tweede vochtsensor in de badkamer (radiatorknop).
//                       Aan op de snelste stijging, vangnet/uit/voortgang
//                       op de LAAGSTE waarde: één natte sensor
//                       vlak bij de douche houdt de afzuiging niet meer
//                       voor de gek. Sensor pas 'verouderd' na 3 uur.
//    1.2.0  2026-11-24  Na 2 uur doordraaien zolang het nog daalt
//                       (≥2% per 30 min); absolute stop na 6 uur.
//    1.1.0  2026-11-22  Handmatig aanzetten respecteren, stijging over
//                       5 min-venster, vangnet t.o.v. slaapkamer, slimmere
//                       kritieke melding, sensor-veroudering, foutafhandeling.
//    1.0.0  -           Originele versie.
// =====================================================================

const VERSIE = '1.3.0';

// --- CONFIGURATIE ---
const NAAM_BADKAMER   = 'Thermometer Badkamer';
const NAAM_BADKAMER_2 = 'Badkamer - Slimme Radiatorknop'; // tweede vochtsensor ('' = niet gebruiken)
const NAAM_REFERENTIE = 'Thermometer Slaapkamer';
const NAAM_VENTILATOR = 'Afzuiging badkamer';
const NAAM_BEHEERDER  = 'Jouw Naam';   // jouw gebruikersnaam in Homey (krijgt de pushberichten)

const DREMPEL_STIJGING   = 4;   // % stijging t.o.v. laagste waarde in het venster
const STIJG_VENSTER_MIN  = 5;   // venster (minuten) voor de stijgingsmeting
const DREMPEL_VERSCHIL   = 12;  // ...of: % boven referentie = ook aan (vangnet)
const STOP_MARGE         = 3;   // % boven referentie om weer uit te gaan

const MIN_DRAAITIJD_MIN       = 10;  // minimale draaitijd na automatisch aan
const MIN_DRAAITIJD_HAND_MIN  = 20;  // minimale draaitijd na handmatig aan (schakelaar)
const VOORTGANG_CHECK_MIN     = 120; // vanaf hier: alleen doordraaien zolang het nog daalt
const VOORTGANG_INTERVAL_MIN  = 30;  // elke X min controleren of het daalt...
const VOORTGANG_MIN_DALING    = 2;   // ...met minimaal zoveel %
const MAX_DRAAITIJD_MIN       = 360; // absolute harde stop (veiligheid)
const COOLDOWN_NA_MAX_MIN     = 120; // na harde stop alleen nog aan bij echte stijging

const CRITICAL_GRENS     = 90;  // %
const CRITICAL_NA_MIN    = 45;  // alleen alarm als hij al zo lang draait (of niet draait)
const CRITICAL_HERHAAL_MIN = 30;

const SENSOR_MAX_OUD_MIN = 180; // sensorwaarde ouder dan dit = niet vertrouwen

console.log(`--- Start Script: Badkamer Afzuiging v${VERSIE} ---`);

// Versie opslaan (variabele + tag), zodat je in Homey ziet welke versie draait
const vorigeVersie = global.get('BadkamerScriptVersie');
if (vorigeVersie !== VERSIE) {
  global.set('BadkamerScriptVersie', VERSIE);
  await tag('Badkamer_Script_Versie', VERSIE);
}

// --- 1. Apparaten en gebruiker ophalen ---
const devices = Object.values(await Homey.devices.getDevices());
const users   = Object.values(await Homey.users.getUsers());

const badkamer   = devices.find(d => d.name === NAAM_BADKAMER);
const badkamer2  = NAAM_BADKAMER_2 ? devices.find(d => d.name === NAAM_BADKAMER_2) : null;
const referentie = devices.find(d => d.name === NAAM_REFERENTIE);
const ventilator = devices.find(d => d.name === NAAM_VENTILATOR);
const beheerder  = users.find(u => u.name === NAAM_BEHEERDER);

// --- Helpers ---
const stuurTijdlijn = async (tekst) => {
  try {
    await Homey.flow.runFlowCardAction({
      uri: 'homey:manager:notifications',
      id: 'homey:manager:notifications:create_notification',
      args: { text: tekst },
    });
  } catch (e) { console.log('Tijdlijn mislukt:', e.message); }
};

const stuurPush = async (tekst, kritiek = false) => {
  if (!beheerder) return;
  try {
    await Homey.flow.runFlowCardAction({
      uri: 'homey:manager:mobile',
      id: kritiek ? 'homey:manager:mobile:push_text_critical' : 'homey:manager:mobile:push_text',
      args: { user: beheerder, text: tekst },
    });
  } catch (e) { console.log('Push mislukt:', e.message); }
};

// Melding van de versiewissel (na de helpers, zodat de tijdlijn beschikbaar is)
if (vorigeVersie !== VERSIE) {
  await stuurTijdlijn(`🔄 Badkamer script bijgewerkt: v${vorigeVersie || '?'} → v${VERSIE}`);
}

const zetVentilator = async (aan) => {
  try {
    await ventilator.setCapabilityValue('onoff', aan);
    return true;
  } catch (e) {
    await stuurTijdlijn(`❌ Afzuiging ${aan ? 'aan' : 'uit'}zetten mislukt: ${e.message}`);
    return false;
  }
};

const wisStatus = () => {
  global.set('VentilatorStartTijd', null);
  global.set('VentilatorHandmatig', false);
  global.set('BadVoortgang', null);
};

const stopOpMax = async (reden, humLaag) => {
  if (await zetVentilator(false)) {
    wisStatus();
    global.set('VentilatorMaxStop', Date.now());
    await stuurTijdlijn(`🛑 Afzuiging uit: ${reden} (nog ${humLaag}%).`);
    await stuurPush(`De afzuiging is uitgezet: ${reden}. Badkamer nog ${humLaag}%.`);
    return true;
  }
  return false;
};

// --- 2. Validatie ---
if (!badkamer || !referentie || !ventilator) {
  await stuurTijdlijn(`❌ Badkamer Script v${VERSIE}: apparaten niet gevonden.`);
  return false;
}

const humRef = referentie.capabilitiesObj?.measure_humidity?.value;
const isAan  = ventilator.capabilitiesObj?.onoff?.value === true;
const nu     = Date.now();

if (NAAM_BADKAMER_2 && !badkamer2) {
  console.log(`⚠️ Tweede sensor '${NAAM_BADKAMER_2}' niet gevonden, ik gebruik alleen '${NAAM_BADKAMER}'.`);
}

// Per badkamersensor: waarde, actualiteit en stijging over het venster
const sensoren = [badkamer, badkamer2].filter(Boolean).map((dev, i) => {
  const cap = dev.capabilitiesObj?.measure_humidity;
  const waarde = cap?.value;
  const leeftijdMin = cap?.lastUpdated ? (nu - new Date(cap.lastUpdated).getTime()) / 60000 : 0;
  const sleutel = i === 0 ? 'BadHistorie' : `BadHistorie${i + 1}`;

  let stijging = 0;
  if (typeof waarde === 'number') {
    let historie = [];
    try { historie = JSON.parse(global.get(sleutel) || '[]'); } catch (e) { historie = []; }
    historie = historie.filter(p => nu - p.t <= STIJG_VENSTER_MIN * 60000);
    const laagste = historie.length ? Math.min(...historie.map(p => p.v)) : waarde;
    stijging = waarde - laagste;
    historie.push({ t: nu, v: waarde });
    global.set(sleutel, JSON.stringify(historie));
  }
  return { naam: dev.name, waarde, leeftijdMin, oud: leeftijdMin > SENSOR_MAX_OUD_MIN, stijging };
});

const metWaarde = sensoren.filter(s => typeof s.waarde === 'number');
const actueel   = metWaarde.filter(s => !s.oud);

if (!metWaarde.length || typeof humRef !== 'number') {
  await stuurTijdlijn(`⚠️ Badkamer Script v${VERSIE}: sensoren geven geen waarde.`);
  return false;
}

// Verouderde sensor melden (max. 1x per 6 uur per sensor)
for (const s of metWaarde.filter(s => s.oud)) {
  const sleutel = `SensorOudGemeld_${s.naam}`;
  const gemeld = global.get(sleutel);
  if (!gemeld || nu - gemeld > 6 * 3600000) {
    await stuurTijdlijn(`⚠️ ${s.naam} heeft al ${Math.round(s.leeftijdMin)} min geen nieuwe waarde gestuurd.`);
    global.set(sleutel, nu);
  }
}

// Bij voorkeur actuele sensoren; zijn die er niet, dan de laatst bekende waarden
const basis    = actueel.length ? actueel : metWaarde;
const humHoog  = Math.max(...basis.map(s => s.waarde));   // voor aanzetten
const humLaag  = Math.min(...basis.map(s => s.waarde));   // voor uitzetten/voortgang/alarm
const stijging = actueel.length ? Math.max(...actueel.map(s => s.stijging)) : 0;
const sensorOud = actueel.length === 0;

// --- 4. Status synchroniseren met de werkelijkheid ---
const ruweStart = global.get('VentilatorStartTijd');
let startTijd = ruweStart ? new Date(ruweStart).getTime() : null;
let handmatig = global.get('VentilatorHandmatig') === true;
let aanNu = isAan;

if (!isAan && startTijd) {
  // Uitgezet via schakelaar of app
  wisStatus();
  startTijd = null;
  handmatig = false;
}
if (isAan && !startTijd) {
  // Aangezet via schakelaar of app: respecteren, niet direct uitzetten
  startTijd = nu;
  handmatig = true;
  global.set('VentilatorStartTijd', nu);
  global.set('VentilatorHandmatig', true);
  console.log('✋ Handmatig aanzetten gedetecteerd.');
}

for (const s of sensoren) {
  console.log(`📊 ${s.naam}: ${s.waarde}% (stijging ${s.stijging.toFixed(1)}% / ${STIJG_VENSTER_MIN} min)${s.oud ? ' [VEROUDERD]' : ''}`);
}
console.log(`📊 Hoog ${humHoog}% | Laag ${humLaag}% | Ref ${humRef}% | Ventilator ${isAan ? 'AAN' : 'UIT'}${handmatig ? ' (handmatig)' : ''}`);

// --- 5. AANZETTEN ---
const laatsteMaxStop = global.get('VentilatorMaxStop');
const inCooldown = laatsteMaxStop && (nu - laatsteMaxStop) < COOLDOWN_NA_MAX_MIN * 60000;

const snelleStijging = stijging >= DREMPEL_STIJGING;
// Vangnet op de LAAGSTE waarde: alle sensoren moeten het eens zijn, anders houdt
// één natte sensor de afzuiging aan/uit aan het pendelen
const veelTeVochtig  = !inCooldown && humLaag >= humRef + DREMPEL_VERSCHIL;

if (!isAan && !sensorOud && humHoog > humRef && (snelleStijging || veelTeVochtig)) {
  console.log(`🚀 Douche gedetecteerd (${snelleStijging ? 'stijging' : 'verschil'}). Afzuiging AAN.`);
  if (await zetVentilator(true)) {
    aanNu = true;
    startTijd = nu;
    handmatig = false;
    global.set('VentilatorStartTijd', nu);
    global.set('VentilatorHandmatig', false);
    await stuurTijdlijn(`🚿 Douche aan! (${humHoog}%)`);
    await stuurPush(`🚿 De douche is aan. De afzuiging start bij ${humHoog}%.`);
  }
}

// --- 6. UITZETTEN ---
else if (isAan && startTijd) {
  const draaiMin = (nu - startTijd) / 60000;
  const minDraai = handmatig ? MIN_DRAAITIJD_HAND_MIN : MIN_DRAAITIJD_MIN;

  // Voortgang bijhouden: na VOORTGANG_CHECK_MIN alleen doordraaien zolang het nog droger wordt
  let voortgang = null;
  try { voortgang = JSON.parse(global.get('BadVoortgang') || 'null'); } catch (e) { voortgang = null; }
  let stagnatie = false;
  if (draaiMin >= VOORTGANG_CHECK_MIN) {
    if (!voortgang) {
      global.set('BadVoortgang', JSON.stringify({ t: nu, v: humLaag }));
    } else if (nu - voortgang.t >= VOORTGANG_INTERVAL_MIN * 60000) {
      const daling = voortgang.v - humLaag;
      console.log(`📉 Daling laatste ${VOORTGANG_INTERVAL_MIN} min: ${daling.toFixed(1)}%`);
      if (daling < VOORTGANG_MIN_DALING) stagnatie = true;
      else global.set('BadVoortgang', JSON.stringify({ t: nu, v: humLaag }));
    }
  }

  if (draaiMin >= MAX_DRAAITIJD_MIN) {
    console.log(`⚠️ Absolute maximale draaitijd (${MAX_DRAAITIJD_MIN} min) bereikt.`);
    if (await stopOpMax(`maximale tijd van ${Math.round(MAX_DRAAITIJD_MIN / 60)} uur bereikt`, humLaag)) aanNu = false;
  } else if (stagnatie) {
    console.log('⚠️ Vochtigheid daalt niet meer. Afzuigen heeft geen zin meer.');
    if (await stopOpMax(`na ${Math.round(draaiMin)} min daalt de vochtigheid niet meer`, humLaag)) aanNu = false;
  } else if (humLaag <= humRef + STOP_MARGE) {
    if (draaiMin >= minDraai) {
      console.log('🏁 Lucht weer droog. Afzuiging UIT.');
      if (await zetVentilator(false)) {
        aanNu = false;
        wisStatus();
        await stuurTijdlijn(`✅ Afzuiging uit (${humLaag}%, ${Math.round(draaiMin)} min gedraaid).`);
      }
    } else {
      console.log(`⏳ Minimale draaitijd: nog ${(minDraai - draaiMin).toFixed(1)} min.`);
    }
  }
}

// --- 7. KRITIEKE MELDING (alleen als er echt iets mis lijkt) ---
if (!sensorOud && humLaag >= CRITICAL_GRENS) {
  const draaiMin = aanNu && startTijd ? (nu - startTijd) / 60000 : 0;
  if (!aanNu || draaiMin >= CRITICAL_NA_MIN) {
    const laatste = global.get('LaatsteCriticalPush');
    const laatsteMs = laatste ? new Date(laatste).getTime() : 0;
    if (nu - laatsteMs > CRITICAL_HERHAAL_MIN * 60000) {
      await stuurPush(
        aanNu
          ? `🚨 Badkamer na ${Math.round(draaiMin)} min afzuigen nog ${humLaag}%! Raam open of afzuiging kapot?`
          : `🚨 Badkamer ${humLaag}% en de afzuiging staat UIT!`,
        true
      );
      global.set('LaatsteCriticalPush', nu);
    }
  }
}

// --- 8. Opslaan ---
await tag('Badkamer_Vochtigheid_Nu', humLaag);

return true;
