// Léxico y patrones (ES/EN). Todo está en forma "plegada": minúsculas y sin tildes (la ñ se conserva).

export const STOP_ES = new Set(`a al algo algun alguna algunas alguno algunos ante antes aqui asi aun aunque bien cada casi como con contra cual cuales cuando cuanto de del desde donde dos el ella ellas ellos en entre era eran eres es esa esas ese eso esos esta estaba estaban estado estamos estan estar estas este esto estos estoy fue fueron fui ha haber habia han hasta hay he hemos la las le les lo los me mi mis mas mucho muchos muy nada ni no nos nosotros nuestra nuestro o os otra otras otro otros para pero poco por porque que quien quienes se sea segun ser si sido siempre sin sobre solo son soy su sus tambien tan tanto te tendria tengo ti tiene tienen todo todos tu tus un una unas uno unos usted ustedes va vamos van vas ve veces ver vez voy vosotros y ya yo ahi ahora alli entonces luego mismo misma mismos mismas otra pues bueno vale ok eh mm ejemplo cosa cosas parte forma manera tipo decir dice dicen digo hacer hace hacen hago puede pueden puedo podemos poder quiero quiere quieren queremos tener tenemos tenia vez video hoy aca asi mira mire oye fijate verdad claro entonces tal tales cuyo todavia hacia durante mediante tras ademas aun incluso mientras sino pues dia dias año años mejor mejores gente tiempo momento punto problema caso lado lugar trabajo primer primera segundo tercera ultimo ultima proximo proxima proximos proximas nuevo nueva nuevos nuevas mucha muchas importante importantes grande grandes pequeño pequeña gran bueno buena buenos buenas malo mala mismo siguiente`.split(/\s+/));

export const STOP_EN = new Set(`a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just like me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yeah okay ok um uh really actually basically kind sort thing things lot get got going go want know think say said let lets one two make makes made see look`.split(/\s+/));

// Frases de relleno/promoción que no deben llegar al resumen ni a los consejos.
export const BOILERPLATE = [
  'suscribete', 'suscribanse', 'suscribirte', 'dale like', 'dale a like', 'deja tu comentario', 'deja un comentario',
  'campanita', 'campana de notificaciones', 'patrocin', 'enlace en la descripcion', 'link en la descripcion',
  'en la descripcion', 'bienvenido', 'bienvenidos', 'hola a todos', 'hola amigos', 'gracias por ver', 'gracias por verlo',
  'nos vemos en el proximo', 'nos vemos en el siguiente', 'hasta la proxima', 'siguenos en', 'sigueme en', 'redes sociales',
  'comparte este video', 'comparte el video', 'like and subscribe', 'subscribe', 'hit the bell', 'smash the like',
  'welcome back', 'welcome to', 'link in the description', 'in the description', 'sponsored by', 'thanks for watching',
  'see you in the next', 'follow me on', 'check out my', 'patreon', 'before we get started', 'antes de empezar'
];

// ---- Consejos / recomendaciones ----
// Cada patrón trae un peso; se aplican sobre la frase plegada.
export const ADVICE_STRONG = [
  /\b(te|les|le|os) (recomiendo|sugiero|aconsejo|recomendamos|sugerimos)\b/, /\b(recomiendo|sugiero|aconsejo)\b/,
  /\b(mi|un|el|este|otro) (consejo|truco|tip)\b/, /\b(la|el) (clave|secreto|truco) (es|esta|para|de)\b/,
  /\b(debes|deberias|deberia|tienes que|tenemos que|hay que|necesitas|conviene)\b/,
  /\b(es|resulta|sera) (muy |super )?(importante|fundamental|clave|esencial|necesario|crucial|vital|mejor|recomendable)\b/,
  /\b(lo mejor|lo ideal|lo primero|lo importante|lo recomendable) (es|que|seria)\b/,
  /\b(no olvides|no te olvides|recuerda|asegurate|aseguraos|procura|trata de|intenta|evita|evitar|evitalo)\b/,
  /\b(you should|you need to|you must|you have to|make sure|be sure to|i recommend|i suggest|my advice|my tip|the key is|the secret is|best way|it'?s important to|it is important to|remember to|try to|avoid)\b/
];
export const ADVICE_COND = [
  /\bsi (quieres|quiere|deseas|buscas|necesitas|tu quieres|queremos|quieren) /, /\bpara (lograr|conseguir|mejorar|evitar|aprender|ser)\b/,
  /\bif you (want|need|wish|are trying|'re trying)\b/, /\bin order to\b/
];
export const NEG_IMPERATIVE = /^(no|nunca|jamas|don'?t|do not|never)\s+\w+/;
export const IMPERATIVES_ES = new Set(`haz hazlo usa utiliza prueba piensa toma elige escoge crea define establece anota escribe dedica reserva planifica organiza prioriza mide revisa pregunta busca deja manten mantente sigue aprende practica cambia agrega anade elimina reduce limita empieza comienza evita intenta trata procura recuerda asegurate olvida ten ponte pon enfocate concentrate descansa duerme bebe come camina respira escucha habla pide comparte delega automatiza simplifica divide separa enfoca apaga desactiva borra guarda ahorra invierte compara lee observa imagina visualiza repite repasa memoriza resume subraya cuestiona acepta perdona celebra agradece fija abre cierra suma resta calcula crea inicia termina prepara comprueba verifica sal ve ven vuelve vincula une conecta disena guarda esconde marca cuida confia apila planea cumple premia recompensa registra rodeate comprometete entrena estudia trabaja juega relajate disfruta esfuerzate apunta cuenta arma construye elabora genera fomenta impulsa aprovecha pon sumate elimina`.split(/\s+/));
export const IMPERATIVES_EN = new Set(`start use take write set focus keep stop try make build learn practice avoid ask check read get find pick choose limit reduce create plan track review remember be give put add remove break schedule prioritize test begin stay turn delete write drink eat sleep walk breathe listen speak share delegate automate simplify split turn save invest compare`.split(/\s+/));
export const LEADING_FILLERS = /^(y|e|pero|pues|bueno|entonces|ahora|primero|segundo|tercero|ok|vale|mira|oye|asi que|asi|por eso|ademas|and|but|so|well|now|okay|then|first|second|third|also|look|listen)[,\s]+/;

export const RECOMMEND_CUES = [
  /\b(en resumen|en conclusion|para terminar|para concluir|para resumir|resumiendo|conclusion|lo que debes recordar|lo que tienes que recordar|quedate con|llevate)\b/,
  /\b(mi recomendacion|recomiendo|recomendamos|sugiero|lo ideal|lo mejor|la clave|el secreto|lo mas importante|el error mas comun|el mayor error|el principal error|no cometas|la regla|el principio)\b/,
  /\b(in conclusion|to sum up|in summary|bottom line|the key|the secret|most important|biggest mistake|common mistake|the rule|the principle|i recommend|takeaway)\b/
];
export const CAUSAL = /\b(porque|ya que|debido a|puesto que|gracias a|asi que|por eso|de esa manera|de este modo|because|since|so that|that'?s why|which means)\b/;
export const SUMMARY_CUES = [
  /\b(lo mas importante|la clave|en resumen|en conclusion|la idea principal|el punto clave|lo fundamental|lo esencial)\b/,
  /\b(the main idea|key point|in summary|most important|the point is|the takeaway)\b/
];

export const CATEGORIES = [
  ['Hábito', /\b(habito|habitos|rutina|rutinas|cada dia|todos los dias|diario|diaria|constancia|consistencia|habit|habits|routine|daily|consistency)\b/],
  ['Mentalidad', /\b(mente|mentalidad|actitud|creer|creencia|miedo|motivacion|disciplina|confianza|ansiedad|estres|mindset|belief|fear|motivation|discipline|confidence)\b/],
  ['Entorno', /\b(entorno|espacio|ambiente|escritorio|celular|telefono|movil|distraccion|distracciones|notificaciones|environment|phone|distraction|distractions|desk)\b/],
  ['Salud', /\b(sueño|sueno|dormir|alimentacion|dieta|descanso|salud|sleep|exercise|diet|health|nutricion)\b/],
  ['Finanzas', /\b(dinero|ahorro|ahorrar|inversion|invertir|deuda|presupuesto|ingresos|gastos|money|saving|invest|debt|budget|income)\b/],
  ['Comunicación', /\b(hablar|escuchar|conversacion|comunicar|comunicacion|voz|audiencia|presentacion|speak|listen|conversation|communication|audience|presentation)\b/],
  ['Productividad', /\b(tiempo|prioridad|prioridades|tarea|tareas|agenda|calendario|planificar|enfoque|enfocarte|productividad|time|priority|task|tasks|schedule|focus|productivity)\b/],
  ['Aprendizaje', /\b(aprender|estudiar|estudio|memoria|memorizar|repasar|practicar|practica|learn|study|memory|practice|review)\b/],
  ['Técnica', /\b(tecnica|metodo|paso|pasos|herramienta|herramientas|sistema|proceso|technique|method|step|steps|tool|tools|system|process)\b/]
];
