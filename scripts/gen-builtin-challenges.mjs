/**
 * gen-builtin-challenges.mjs — Regenera js/builtin-challenges.js.
 *
 * WAVE 8.1: el registro de retos incorporados (pestaña «Retos» sin examen)
 * se deriva de las semillas en skills/fisicahn/data/challenges/:
 *   - 4 JSON legacy (cinematica/dinamica/electricidad/optica-retos.json)
 *   - el pack de ejemplo (ejemplo-pack-examen.json)
 *   - los retos EXTRA de los motores sin cobertura (abajo, en este mismo)
 * El resultado es un único módulo ESM sin dependencias ni fetches.
 *
 * Uso: node scripts/gen-builtin-challenges.mjs
 * Verificación: node --test js/tests/pedagogy.test.mjs (cobertura ≥2 por motor)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'skills', 'fisicahn');
const DATA = path.join(SRC, 'data', 'challenges');
const OUT = path.join(SRC, 'js', 'builtin-challenges.js');

const ENGINE_KEYS = [
  'units-error','vectors','hyperbola','kinematics','projectile','dynamics','mass-weight',
  'inclined-plane','force-kinetic','elasticity','friction','statics','momentum','collisions-2d',
  'work-energy','rotational','oscillatory','pendulum','standing-waves','fluids','thermodynamics',
  'calorimetry','kinetic-theory','thermal-expansion','sound','electricity','circuits','magnetic',
  'em-waves','gravity','kepler','optics','lenses','mirrors','induction','wave-optics',
  'optical-instruments','atomic','photoelectric','radioactivity','tunneling','particles',
  'de-broglie','nuclear-energy','special-relativity','quantum-history'
];

/** Claves de semilla del pack/legacy → engineKey del catálogo. */
const ALIASES = { 'sound-waves': 'sound' };

/** Retos nuevos para motores sin cobertura en las semillas (WAVE 8). */
const EXTRA = {
  'momentum': [
    { id:'mom-1', type:'numeric', question:'Un camión de 2000 kg va a 10 m/s. ¿Cuánto vale su cantidad de movimiento p = m·v?', answer:20000, unit:'kg·m/s', hint:'p = m·v = 2000·10', points:10 },
    { id:'mom-2', type:'numeric', question:'Dos autos de 1000 kg chocan frontalmente a 5 m/s y quedan pegados. ¿Cuánto vale la velocidad final común? (conservación de p)', answer:0, unit:'m/s', hint:'p_total = 0 → quedan en reposo', points:15 },
    { id:'mom-3', type:'multiple', question:'En un choque elástico de iguales masas, la energía cinética…', options:['Se pierde toda','Se conserva','Aumenta','Desaparece'], answer:1, hint:'Elástico: se conserva la energía', points:10 },
    { id:'mom-4', type:'numeric', question:'Impulso J = F·Δt con F = 100 N durante 0.2 s. ¿Cuánto vale J?', answer:20, unit:'N·s', hint:'J = 100·0.2', points:10 },
    { id:'mom-5', type:'select', question:'La variación de momento Δp de un cuerpo es igual a…', options:['El impulso aplicado','La energía','La masa','El peso'], answer:0, hint:'Teorema impulso-momento: Δp = J', points:10 }
  ],
  'friction': [
    { id:'fri-1', type:'numeric', question:'Caja de 20 kg sobre suelo con μₑ = 0.4. ¿Qué fuerza mínima se necesita para arrancarla? (N = m·g = 196 N)', answer:78.4, unit:'N', hint:'f_max = μₑ·N = 0.4·196', points:10 },
    { id:'fri-2', type:'numeric', question:'Sobre 10 kg con μₖ = 0.3, ¿cuánto vale la fricción cinética? (g = 9.8)', answer:29.4, unit:'N', hint:'fₖ = 0.3·(10·9.8)', points:10 },
    { id:'fri-3', type:'select', question:'Antes del deslizamiento, la fricción estática…', options:['Equilibra al empuje','Siempre es máxima','No existe','Es cero siempre'], answer:0, hint:'Se ajusta hasta el límite μ·N', points:10 },
    { id:'fri-4', type:'numeric', question:'Un bloque se desliza a velocidad constante sobre μ = 0.2 con masa 5 kg. ¿Qué fuerza neta horizontal actúa?', answer:0, unit:'N', hint:'Velocidad constante → Fneta = 0', points:10 },
    { id:'fri-5', type:'numeric', question:'Plano inclinado con empuje normal N = 100 N y μₑ = 0.3. ¿Cuál es la fricción estática máxima?', answer:30, unit:'N', hint:'f_max = μₑ·N = 0.3·100', points:10 }
  ],
  'statics': [
    { id:'st-1', type:'numeric', question:'Un peso de 100 N cuelga de dos cuerdas simétricas a 30° de la vertical. ¿Qué tensión en cada cuerda?', answer:57.7, unit:'N', hint:'2T·cos30° = 100 → T = 100/1.732', points:15 },
    { id:'st-2', type:'select', question:'En equilibrio de una partícula, la suma de fuerzas…', options:['Debe ser cero','Debe ser 9.8','Es máxima','Apunta al centro'], answer:0, hint:'ΣF = 0', points:10 },
    { id:'st-3', type:'numeric', question:'Torque τ = F·r·sinθ: F = 50 N aplicada a 0.4 m del eje a 90°. ¿Cuánto vale τ?', answer:20, unit:'N·m', hint:'τ = 50·0.4·1', points:10 },
    { id:'st-4', type:'numeric', question:'Viga en equilibrio con un peso de 2 kg a 0.5 m del apoyo. ¿Dónde (en m) debe colgarse un peso de 1 kg para balancearla?', answer:1, unit:'m', hint:'2·0.5 = 1·x → x = 1', points:15 },
    { id:'st-5', type:'select', question:'Tres fuerzas equilibran un punto. Sus vectores forman…', options:['Un triángulo cerrado','Una línea recta','Un círculo','Nada especial'], answer:0, hint:'ΣF = 0 dibujada de punta a cola cierra el polígono', points:10 }
  ],
  'force-kinetic': [
    { id:'fk-1', type:'numeric', question:'F = m·a: un empujón de 40 N sobre 8 kg produce a = ?', answer:5, unit:'m/s²', hint:'a = F/m', points:10 },
    { id:'fk-2', type:'numeric', question:'Ec = ½·m·v² con m = 2 kg y v = 6 m/s → Ec =', answer:36, unit:'J', hint:'0.5·2·36', points:10 },
    { id:'fk-3', type:'numeric', question:'F = m·a: fuerzas de 50 N sobre una masa de 5 kg → aceleración', answer:10, unit:'m/s²', hint:'a = 50/5', points:10 },
    { id:'fk-4', type:'numeric', question:'Para acelerar 2 kg a 10 m/s² se necesita una fuerza de…', answer:20, unit:'N', hint:'F = 2·10', points:10 },
    { id:'fk-5', type:'select', question:'La aceleración de un cuerpo apunta en la dirección de la…', options:['Fuerza neta','Velocidad','Energía','Potencia'], answer:0, hint:'Segunda ley: a̅ ∥ ΣF̅', points:10 }
  ],
  'work-energy': [
    { id:'we-1', type:'numeric', question:'W = F·d·cosθ con F = 20 N, d = 5 m, θ = 0° → W =', answer:100, unit:'J', hint:'20·5·1', points:10 },
    { id:'we-2', type:'numeric', question:'Un cuerpo de 4 kg sube a 10 m/s → Ec = ½·m·v² =', answer:200, unit:'J', hint:'0.5·4·100', points:10 },
    { id:'we-3', type:'numeric', question:'Potencia P = W/t con W = 600 J y t = 3 s → P =', answer:200, unit:'W', hint:'P = W/t', points:10 },
    { id:'we-4', type:'numeric', question:'Un cuerpo de 1 kg cae libre 2 m (g = 10). Al llegar abajo, ΔEc = m·g·h →', answer:20, unit:'J', hint:'1·10·2', points:10 },
    { id:'we-5', type:'select', question:'Un objeto sube a velocidad constante (cuando F externa compensa el peso): el trabajo neto es…', options:['Cero','Positivo','Negativo','n.d.'], answer:0, hint:'Sin cambio de velocidad no hay cambio de energía cinética', points:10 }
  ],
  'rotational': [
    { id:'rot-1', type:'numeric', question:'Fuerza de 20 N aplicada a 0.5 m del eje (θ = 90°). ¿Cuánto vale el torque τ = F·r?', answer:10, unit:'N·m', hint:'20·0.5', points:10 },
    { id:'rot-2', type:'numeric', question:'Rueda de radio 0.3 m que da 2 vueltas/s. ¿Cuánto vale v = ω·r con ω = 4π rad/s?', answer:3.77, unit:'m/s', hint:'v = (4π)·0.3 ≈ 3.77', points:15 },
    { id:'rot-3', type:'numeric', question:'I = ½·M·R² para un disco de M = 2 kg y R = 0.1 m → I =', answer:0.01, unit:'kg·m²', hint:'0.5·2·0.01', points:10 },
    { id:'rot-4', type:'numeric', question:'L = I·ω con I = 1 kg·m² y ω = 4 rad/s → L =', answer:4, unit:'kg·m²/s', hint:'1·4', points:10 },
    { id:'rot-5', type:'select', question:'Un patinador gira sobre el hielo. Al juntar los brazos al cuerpo…', options:['Gira más rápido','Gira más lento','Se detiene','Nada cambia'], answer:0, hint:'L = Iω se conserva y I baja', points:10 }
  ],
  'oscillatory': [
    { id:'osc-1', type:'numeric', question:'F = −k·x con k = 200 N/m y x = 0.05 m. |F| =', answer:10, unit:'N', hint:'200·0.05', points:10 },
    { id:'osc-2', type:'numeric', question:'Resorte k = 100 N/m y m = 1 kg: ω = √(k/m) → ω =', answer:10, unit:'rad/s', hint:'√100', points:10 },
    { id:'osc-3', type:'numeric', question:'Energía de resorte E = ½·k·x² con k = 200 N/m y x = 0.1 m → E =', answer:1, unit:'J', hint:'0.5·200·0.01', points:10 },
    { id:'osc-4', type:'select', question:'En el MHS, la aceleración apunta…', options:['Siempre al centro','A la derecha','Solo abajo','Siempre arriba'], answer:0, hint:'a = −ω²·x', points:10 },
    { id:'osc-5', type:'numeric', question:'Período T = 2π·√(m/k) con m = 1 kg y k = 100 N/m → T =', answer:0.628, unit:'s', hint:'2π·√(1/100) = 2π·0.1', points:15 }
  ],
  'thermodynamics': [
    { id:'th-1', type:'numeric', question:'PV = nRT: p = 100 kPa, V = 2 m³, n = 1 mol. ¿Qué T en K? (R = 8.314): T = 1e5·2/(1·8.314)', answer:24055.8, unit:'K', hint:'T = 2e5/8.314', points:15 },
    { id:'th-2', type:'select', question:'En un proceso isotérmico, la temperatura…', options:['Se mantiene constante','Aumenta linear','Baja exponencialmente','Sigue al volumen'], answer:0, hint:'Isotérmico: T fija', points:10 },
    { id:'th-3', type:'numeric', question:'Proceso isocoro P/T constante: P₁ = 100 kPa con T₁ = 300 K. Si T₂ = 600 K, P₂ =', answer:200, unit:'kPa', hint:'P₂ = P₁·T₂/T₁', points:10 },
    { id:'th-4', type:'numeric', question:'Ciclo de Carnot entre Tᵥ = 600 K y T_c = 300 K: eficiencia 1 − T_c/Tᵥ =', answer:0.5, unit:'η', hint:'1 − 300/600', points:10 },
    { id:'th-5', type:'numeric', question:'PV = nRT con n = 2 mol y T = 300 K (R = 8.314): PV =', answer:4988.4, unit:'Pa·m³', hint:'2·8.314·300', points:10 }
  ],
  'magnetic': [
    { id:'m-1', type:'numeric', question:'F = q·v·B con q = 1.6e-19 C, v = 2e6 m/s, B = 0.1 T → F (N)', answer:3.2e-14, unit:'N', hint:'1.6e-19·2e6·0.1', points:15 },
    { id:'m-2', type:'select', question:'La fuerza magnética sobre una carga en reposo es…', options:['Cero','Máxima','Igual al campo','Infinita'], answer:0, hint:'F = qvB; si v = 0 → F = 0', points:10 },
    { id:'m-3', type:'numeric', question:'F = q·v·B con q = 2e-16 C, v = 1e6 m/s, B = 0.5 T → F (N)', answer:1e-10, unit:'N', hint:'2e-16·1e6·0.5', points:10 },
    { id:'m-4', type:'select', question:'La fuerza magnética sobre una carga en movimiento es siempre…', options:['Perpendicular a v y a B','Paralela a v','Paralela a B','Al centro de la tierra'], answer:0, hint:'F̅ = q·v̅×B̅ (producto vectorial)', points:10 },
    { id:'m-5', type:'select', question:'Si la velocidad de la carga se duplica, la fuerza magnética…', options:['Se duplica','Se cuadruplica','Queda igual','Se reduce a la mitad'], answer:0, hint:'F ∝ v', points:10 }
  ],
  'gravity': [
    { id:'g-1', type:'numeric', question:'F = G·m₁·m₂/r² con G = 6.67e-11, m₁ = m₂ = 1, r = 1 → F (N)', answer:6.67e-11, unit:'N', hint:'Directo de la ley', points:10 },
    { id:'g-2', type:'numeric', question:'Si se duplica la distancia entre dos masas, la fuerza se divide entre…', answer:4, unit:'veces', hint:'F ∝ 1/r²: (1/2)² = 1/4', points:10 },
    { id:'g-3', type:'numeric', question:'Peso en la Luna: m = 10 kg con g = 1.6 m/s² → P = m·g (N)', answer:16, unit:'N', hint:'10·1.6', points:10 },
    { id:'g-4', type:'numeric', question:'En la Tierra, la gravedad a una distancia de 3 radios (r = 3R_T) vale g/9 →', answer:1.089, unit:'m/s²', hint:'9.8/9 ≈ 1.089', points:15 },
    { id:'g-5', type:'select', question:'La velocidad orbital de un satélite depende de…', options:['La masa del planeta y r','Solo el peso del satélite','La temperatura','El color del planeta'], answer:0, hint:'v = √(GM/r)', points:10 }
  ],
  'kepler': [
    { id:'k-1', type:'select', question:'La 3.ª ley de Kepler: T² es proporcional a…', options:['a²','a³','a','r⁴'], answer:1, hint:'T² ∝ a³', points:10 },
    { id:'k-2', type:'numeric', question:'Si T = 0.5 años, la tercera ley T² = a³ da a³ =', answer:0.25, unit:'UA³', hint:'a³ = T² = 0.25', points:10 },
    { id:'k-3', type:'numeric', question:'Un planeta a a = 4 UA (T² = a³, años): T = ?', answer:8, unit:'años', hint:'T = √(4³) = √64', points:15 },
    { id:'k-4', type:'select', question:'En la primera ley, el Sol está en…', options:['Uno de los focos','El centro del planeta','Ningún lado','El eje menor'], answer:0, hint:'Órbita elíptica, Sol en un foco', points:10 },
    { id:'k-5', type:'numeric', question:'Satélite con T = 1 año → a³ = T² → a (UA)', answer:1, unit:'UA', hint:'a³ = 1 → a = 1', points:10 }
  ],
  'wave-optics': [
    { id:'wo-1', type:'numeric', question:'Young: d·sin θ = m·λ con d = 1e-3 m, λ = 5e-7 m, m = 1. ¿Qué θ en grados?', answer:0.029, unit:'°', hint:'sin θ = 5e-4 → θ ≈ 0.029°', points:15 },
    { id:'wo-2', type:'select', question:'Las franjas de interferencia de Young son producto de…', options:['Dos fuentes coherentes','Una fuente','El espectro','La polarización'], answer:0, hint:'Coherencia entre las dos rendijas', points:10 },
    { id:'wo-3', type:'numeric', question:'Separación entre franjas: Δy = λ·L/d con λ = 5e-7 m, L = 1 m, d = 5e-4 m → Δy (mm)', answer:1, unit:'mm', hint:'5e-7·1/5e-4 = 1e-3 m', points:15 },
    { id:'wo-4', type:'select', question:'Si la longitud de onda sube, las franjas de Young…', options:['Se alejan entre sí','Se juntan','No cambian','Desaparecen'], answer:0, hint:'Δy ∝ λ', points:10 },
    { id:'wo-5', type:'select', question:'El patrón de difracción de una rendija estrecha tiene…', options:['Máximos y mínimos alternados','Solo máximos','Nada','Una línea única'], answer:0, hint:'Interferencia destructiva en los mínimos', points:10 }
  ],
  'lenses': [
    { id:'l-1', type:'numeric', question:'1/f = 1/d₀ + 1/dᵢ con f = 0.2 m y d₀ = 0.5 m → dᵢ (m)', answer:0.333, unit:'m', hint:'1/dᵢ = 5−2 = 3', points:15 },
    { id:'l-2', type:'numeric', question:'Potencia P = 1/f con f = 0.25 m → P (dioptrías)', answer:4, unit:'dioptrías', hint:'1/0.25', points:10 },
    { id:'l-3', type:'numeric', question:'1/f = 1/d₀ + 1/dᵢ con f = 0.2 m y d₀ = 0.3 m → dᵢ (m)', answer:0.6, unit:'m', hint:'1/dᵢ = 5 − 3.33 → dᵢ = 0.6', points:15 },
    { id:'l-4', type:'numeric', question:'Potencia P = 1/f con f = 0.1 m → P (dioptrías)', answer:10, unit:'dioptrías', hint:'1/0.1', points:10 },
    { id:'l-5', type:'select', question:'Un objeto a distancia infinita (d₀ → ∞) forma imagen…', options:['En el foco','En el centro','Nunca forma','En infinito'], answer:0, hint:'1/dᵢ = 1/f', points:10 }
  ],
  'atomic': [
    { id:'a-1', type:'select', question:'En el modelo de Bohr, el electrón…', options:['Solo habita niveles discretos','Cae en espiral al núcleo','No tiene energía','Es una onda plana'], answer:0, hint:'La cuantización de los niveles', points:10 },
    { id:'a-2', type:'numeric', question:'Eₙ = −13.6/n² eV con n = 2 → energía del nivel', answer:-3.4, unit:'eV', hint:'−13.6/4', points:15 },
    { id:'a-3', type:'numeric', question:'Salto de n = 1 → n = 2: ΔE = E₂ − E₁ eV', answer:10.2, unit:'eV', hint:'−3.4 − (−13.6)', points:15 },
    { id:'a-4', type:'select', question:'En el modelo de Bohr, el electrón más cercano al núcleo (n = 1) tiene la energía…', options:['Más negativa','Más positiva','Cero','Infinita'], answer:0, hint:'E ∝ −1/n²', points:10 },
    { id:'a-5', type:'numeric', question:'Eₙ = −13.6/n² eV con n = 4 → energía del nivel', answer:-0.85, unit:'eV', hint:'−13.6/16 = −0.85', points:10 }
  ],
  'photoelectric': [
    { id:'pe-1', type:'numeric', question:'K_max = hf − φ con hf = 6 eV y φ = 2 eV → K_max =', answer:4, unit:'eV', hint:'6−2', points:10 },
    { id:'pe-2', type:'select', question:'Si la frecuencia de la luz está por debajo del umbral…', options:['No salen electrones','Salen más','Sale el doble','El metal se funde'], answer:0, hint:'La energía del fotón no alcanza φ', points:10 },
    { id:'pe-3', type:'numeric', question:'K_max = hf − φ con hf = 5 eV y φ = 2 eV → K_max =', answer:3, unit:'eV', hint:'5 − 2', points:10 },
    { id:'pe-4', type:'select', question:'A fija, si se sube la intensidad de la luz…', options:['Hay más fotoelectrones con la misma K','La K crece','Sale menos gente','No cambia nada'], answer:0, hint:'La intensidad cambia el número de fotones, no su energía', points:10 },
    { id:'pe-5', type:'numeric', question:'Frecuencia umbral f = φ/h con φ = 2 eV = 3.2e-19 J (h = 6.63e-34) → f =', answer:4.83e14, unit:'Hz', hint:'3.2e-19/6.63e-34', points:15 }
  ],
  'radioactivity': [
    { id:'r-1', type:'numeric', question:'Vida media T½ = ln2/λ. Si T½ = 10 s, ¿cuánto vale λ?', answer:0.0693, unit:'s⁻¹', hint:'λ = 0.693/10', points:10 },
    { id:'r-2', type:'select', question:'Después de tres vidas medias, queda de la muestra…', options:['1/8','1/3','1/2','1/6'], answer:0, hint:'(1/2)³ = 1/8', points:10 },
    { id:'r-3', type:'numeric', question:'Tras 2 vidas medias queda la fracción…', answer:0.25, unit:'', hint:'(1/2)² = 1/4', points:10 },
    { id:'r-4', type:'numeric', question:'Muestra de 1000 núcleos con T½ = 5 s. Tras t = 15 s quedan…', answer:125, unit:'', hint:'15 s = 3 vidas medias → 1000/8', points:15 },
    { id:'r-5', type:'select', question:'Una partícula α es un núcleo de…', options:['Helio (4, 2 núcleos)','Hidrógeno','Uranio','Neutrones'], answer:0, hint:'α = núcleo He: 2p+2n', points:10 }
  ],
  'tunneling': [
    { id:'t-1', type:'numeric', question:'T ≈ exp(−2κL): con κ = 1e10 1/m y L = 1e-9 m, el exponente −2κL =', answer:0.02, unit:'−2κL', hint:'2·1e10·1e-9 = 0.02', points:15 },
    { id:'t-2', type:'select', question:'La probabilidad de túnel crece si…', options:['La barrera es más angosta','La barrera es más ancha','Aumenta la masa','Nada la cambia'], answer:0, hint:'Cuanto más angosta, más probable', points:10 },
    { id:'t-3', type:'numeric', question:'T ≈ exp(−2κL) con −2κL = −0.2 → T =', answer:0.819, unit:'T', hint:'e^(−0.2) ≈ 0.819', points:15 },
    { id:'t-4', type:'select', question:'Si la energía de la partícula supera la altura de la barrera…', options:['Cruza sin atenuación','Rebota siempre','Se queda dentro','Crea un agujero'], answer:0, hint:'Transmisión ≈ 1 cuando E > V', points:10 },
    { id:'t-5', type:'numeric', question:'T ≈ exp(−κ·2L) con −2κL = −0.02 → T =', answer:0.98, unit:'T', hint:'e^(−0.02) ≈ 0.980', points:10 }
  ],
  'particles': [
    { id:'p-1', type:'numeric', question:'r = m·v/(q·B) con m = 1.67e-27, v = 1e6, q = 1.6e-19, B = 1 → r (m)', answer:0.0104, unit:'m', hint:'1.67e-21/1.6e-19', points:15 },
    { id:'p-2', type:'select', question:'Las partículas cargadas en campo magnético uniforme describen una…', options:['Circunferencia','Línea recta','Espiral sin fin','Parábola'], answer:0, hint:'F = qvB es centrípeta', points:10 },
    { id:'p-3', type:'numeric', question:'r = m·v/(q·B) con m = 1.67e-27, v = 1e6, q = 1.6e-19, B = 0.5 → r (m)', answer:0.0209, unit:'m', hint:'1.67e-21/(8e-20)', points:15 },
    { id:'p-4', type:'select', question:'Misma v y m, doble carga: el radio de la órbita…', options:['Se hace la mitad','Se duplica','Igual','Se cuadruplica'], answer:0, hint:'r ∝ 1/q', points:10 },
    { id:'p-5', type:'select', question:'Con v perpendicular a B uniforme, el movimiento es…', options:['Circular uniforme','Rectilíneo uniforme','Parabólico','Helicoidal si v||B'], answer:0, hint:'La fuerza es centrípeta constante', points:10 }
  ],
  'de-broglie': [
    { id:'db-1', type:'numeric', question:'λ = h/p con h = 6.63e-34 y p = 2e-24 → λ (m)', answer:3.3e-10, unit:'m', hint:'6.63e-34/2e-24', points:15 },
    { id:'db-2', type:'select', question:'Los electrones rápidos tienen λ…', options:['Más corta','Igual','Más larga','Nula'], answer:0, hint:'p sube → λ baja', points:10 },
    { id:'db-3', type:'numeric', question:'λ = h/p con p = 1.3e-24 kg·m/s → λ (m)', answer:5.1e-10, unit:'m', hint:'6.63e-34/1.3e-24', points:15 },
    { id:'db-4', type:'numeric', question:'Fotón: λ = hc/E con E = 3.2e-19 J (hc = 1.99e-25 J·m) → λ (m)', answer:6.2e-7, unit:'m', hint:'1.99e-25/3.2e-19', points:15 },
    { id:'db-5', type:'select', question:'Si una partícula duplica su velocidad, su longitud de onda…', options:['Se reduce a la mitad','Se duplica','Igual','Se cuadruplica'], answer:0, hint:'λ ∝ 1/p y p ∝ v', points:10 }
  ],
  'nuclear-energy': [
    { id:'ne-1', type:'numeric', question:'E = Δm·c² con Δm = 1e-6 kg y c = 3e8 → E (J)', answer:9e10, unit:'J', hint:'1e-6·(3e8)²', points:15 },
    { id:'ne-2', type:'select', question:'La fusión produce… por nucleón que la fisión en núcleos ligeros', options:['Más energía','Menos energía','Igual','Cero'], answer:0, hint:'Curva de ligadura creciente en núcleos ligeros', points:10 },
    { id:'ne-3', type:'numeric', question:'E = Δm·c² con Δm = 1e-9 kg → E (J)', answer:9e7, unit:'J', hint:'1e-9·9e16', points:10 },
    { id:'ne-4', type:'numeric', question:'Defecto de masa de 0.1 u con 1 u = 931 MeV → energía (MeV)', answer:93.1, unit:'MeV', hint:'0.1·931', points:10 },
    { id:'ne-5', type:'select', question:'En la curva de energía de ligadura, el máximo correspond a…', options:['Núcleos de hierro','Hidrógeno','Uranio','Deuterio'], answer:0, hint:'El hierro es el más estable', points:10 }
  ],
  'special-relativity': [
    { id:'sr-1', type:'numeric', question:'γ = 1/√(1−v²/c²) con v = 0.6c → γ =', answer:1.25, unit:'γ', hint:'1/√(1−0.36) = 1/0.8', points:15 },
    { id:'sr-2', type:'select', question:'Un reloj en movimiento (v constante) marca menos que…', options:['Uno en reposo','Otro igual','Nada','El mismo'], answer:0, hint:'Dilatación temporal Δt′ = γΔt', points:10 },
    { id:'sr-3', type:'numeric', question:'Contracción: L = L₀/γ con γ = 1.25 y L₀ = 1 m (al recorrer) → L (m)', answer:0.8, unit:'m', hint:'1/1.25', points:15 },
    { id:'sr-4', type:'numeric', question:'E = m·c² con m = 2 kg (c = 3e8) → E (J)', answer:1.8e17, unit:'J', hint:'2·9e16', points:10 },
    { id:'sr-5', type:'select', question:'En relatividad, la simultaneidad…', options:['Depende del observador','Es absoluta','No existe','Se detiene'], answer:0, hint:'Dos eventos simultáneos para uno NO lo son para otro', points:10 }
  ],
  'collisions-2d': [
    { id:'c2-1', type:'select', question:'En un choque 2D sin fuerzas externas, el momento se conserva…', options:['Por componentes (x e y)','Solo en la normal','Nunca','Solo en 1D'], answer:0, hint:'p̅_total = cte vectorial', points:10 },
    { id:'c2-2', type:'numeric', question:'Dos discos de 1 kg chocan de frente a 2 m/s y −2 m/s. ¿Cuánto vale p̅ total antes?', answer:0, unit:'kg·m/s', hint:'2 + (−2) = 0', points:10 },
    { id:'c2-3', type:'numeric', question:'Choque inelástico: dos discos de 1 kg van a +4 y −2 m/s y quedan unidos. v_final común', answer:1, unit:'m/s', hint:'(4 − 2)/2 = +1', points:15 },
    { id:'c2-4', type:'select', question:'En un choque inelástico (pegados) la energía cinética…', options:['No se conserva','Se conserva','Aumenta','Tampoco cambia el momento'], answer:0, hint:'Parte se pierde en deformaciones/sonido', points:10 },
    { id:'c2-5', type:'numeric', question:'p̅ inicial: +5 − 3 → p̅ total (kg·m/s)', answer:2, unit:'kg·m/s', hint:'5 − 3', points:10 }
  ],
  'quantum-history': [
    { id:'qh-1', type:'select', question:'La cuantización de la energía nace con el fotón de…', options:['Planck (1900)','Newton','Dalton','Pascal'], answer:0, hint:'E = hf, Planck 1900', points:10 },
    { id:'qh-2', type:'select', question:'Las palabras de Bohr sobre niveles discretos datan del… (década)', options:['1913','1935','1980','1890'], answer:0, hint:'Modelo de Bohr, 1913', points:10 },
    { id:'qh-3', type:'select', question:'El principio de incertidumbre Δx·Δp ≥ ℏ/2 es de…', options:['Heisenberg (1927)','Einstein (1905)','Bohr (1913)','Feynman (1960)'], answer:0, hint:'Heisenberg, 1927', points:10 },
    { id:'qh-4', type:'numeric', question:'Años entre la hipótesis de Planck (1900) y el modelo de Bohr (1913)…', answer:13, unit:'años', hint:'1913 − 1900', points:10 },
    { id:'qh-5', type:'select', question:'La ecuación de onda de la mecánica cuántica la escribió…', options:['Schrödinger','Bohr','Rutherford','Chadwick'], answer:0, hint:'Schrödinger, 1926', points:10 }
  ],
  'hyperbola': [
    { id:'hyp-1', type:'select', question:'En una hipérbola, |PF₁ − PF₂| es constante e igual a…', options:['2a','2c','e','F¹'], answer:0, hint:'Diferencia de distancias a los focos = 2a', points:10 },
    { id:'hyp-2', type:'select', question:'La hipérbola tiene dos…', options:['Ramas','Vértices y nada más','Ceros de onda','Ninguna'], answer:0, hint:'Rama derecha e izquierda', points:10 },
    { id:'hyp-3', type:'numeric', question:'c² = a² + b² con a = 3 y b = 4 → c²', answer:25, unit:'c²', hint:'9 + 16', points:10 },
    { id:'hyp-4', type:'numeric', question:'Excentricidad e = c/a con c = 5 y a = 3 → e =', answer:1.667, unit:'—', hint:'5/3 ≈ 1.667', points:10 },
    { id:'hyp-5', type:'select', question:'Las asíntotas de la hipérbola…', options:['Son rectas a las que se acercan las ramas','La atraviesan','La limitan','No existen'], answer:0, hint:'Asíntotas: y = ±(b/a)·x', points:10 }
  ],
  'electricity': [
    { id:'ele-5', type:'numeric', question:'Ley de Ohm: V = I·R con V = 12 V y R = 4 Ω → I =', answer:3, unit:'A', hint:'I = 12/4', points:10 },
    { id:'ele-6', type:'numeric', question:'P = V·I con V = 12 V e I = 2 A → P =', answer:24, unit:'W', hint:'12·2', points:10 },
    { id:'ele-7', type:'numeric', question:'Tres resistores de 2 Ω en serie: R_eq =', answer:6, unit:'Ω', hint:'2+2+2', points:10 },
    { id:'ele-8', type:'select', question:'En serie la corriente…', options:['Es la misma en todos los elementos','Se reparte','Solo fluye en el primero','Es menor al final'], answer:0, hint:'No hay ramas: mismo I', points:10 },
    { id:'ele-9', type:'numeric', question:'V = I·R para I = 2 A y R = 60 Ω → V (V)', answer:120, unit:'V', hint:'2·60', points:10 }
  ]
};

// ---- Fusión de semillas ----
const map = {};
for (const [file, target] of [
  ['cinematica-retos.json','kinematics'],
  ['dinamica-retos.json','dynamics'],
  ['electricidad-retos.json','circuits'],
  ['optica-retos.json','optics']
]) {
  const raw = JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));
  for (const c of raw) (map[target] ||= []).push(c);
}

const pack = JSON.parse(fs.readFileSync(path.join(DATA, 'ejemplo-pack-examen.json'), 'utf8'));
for (const [key, arr] of Object.entries(pack.modules || {})) {
  const t = ALIASES[key] || key;
  if (!ENGINE_KEYS.includes(t)) continue;
  for (const c of arr) (map[t] ||= []).push(c);
}
for (const [mod, arr] of Object.entries(EXTRA)) {
  (map[mod] ||= []).push(...arr);
}

// ---- Escritura del módulo ----
const lines = [
  '/**',
  ' * builtin-challenges.js — Retos incorporados por módulo (WAVE 8.1).',
  ' *',
  ' * Semilla de la pestaña «Retos» cuando no hay examen activo. Se deriva de',
  ' * skills/fisicahn/data/challenges/*.json y de los retos de la WAVE 8;',
  ' * regenerar con `node scripts/gen-builtin-challenges.mjs`.',
  ' *',
  ' * Formato compatible con ChallengeEngine: { id, type, question, answer,',
  ' *   unit?, hint?, options?, points? }',
  ' */',
  '',
  '/** @type {Record<string, Array>} */',
  'export const BUILTIN_CHALLENGES = {',
];
for (const [mod, arr] of Object.entries(map).sort()) {
  lines.push(`  '${mod}': [`);
  for (const c of arr) {
    const e = { id: c.id, type: c.type, question: c.question, answer: c.answer };
    if (c.unit) e.unit = c.unit;
    if (c.hint) e.hint = c.hint;
    if (c.options) e.options = c.options;
    e.points = c.points || 10;
    lines.push('    ' + JSON.stringify(e) + ',');
  }
  lines.push('  ],');
}
lines.push('};');
fs.writeFileSync(OUT, lines.join('\n') + '\n');

let count = 0;
for (const v of Object.values(map)) count += v.length;
console.log(`OK: ${Object.keys(map).length} motores, ${count} retos → ${OUT}`);
const missing = ENGINE_KEYS.filter((k) => !(map[k] || []).length);
if (missing.length) console.log('⚠ sin cobertura:', missing.join(', '));