// Lore documents found in the world. Reading one in the inventory grants a little experience once.

export interface LoreDoc {
  id: string
  title: string
  text: string
}

export const LORE: Record<string, LoreDoc> = {
  miller_note: {
    id: "miller_note",
    title: "Zettel des Müllers",
    text: "Die Bauern haben mich gewarnt, aber ich bin geblieben. Das Mehl muss gemahlen werden, Seuche hin oder her. Gestern Nacht hat jemand am Tor gekratzt. Heute früh war es Hannes vom Hof oben, oder das, was von ihm übrig ist. Ich habe die Kiste mit dem Ersparten unter die Treppe gestellt, falls mich jemand findet. Sagt meiner Schwester in Königsmünde, dass ich sie liebe.",
  },
  huntsman_warning: {
    id: "huntsman_warning",
    title: "Warnung des Wildhüters",
    text: "Wer das hier liest: Meidet die Senken, in denen der grüne Nebel steht. Er kommt aus dem Boden, wo die Toten liegen, und wer ihn atmet, hustet nach drei Tagen schwarz. Die schnellen Toten jagen in Rudeln und riechen Blut auf hundert Schritt. Ich habe den Bogen meines Vaters in der Hütte versteckt. Nehmt ihn, wenn ich nicht zurückkomme. Ich gehe zum Steinbruch, Elke suchen.",
  },
  castellan_orders: {
    id: "castellan_orders",
    title: "Befehle des Kastellans",
    text: "An die Garnison von Rabenstein: Das Tor bleibt geschlossen, auch für die Flüchtlinge aus dem Dorf. Jeder, der hustet, wird in die Kasematten gebracht. Der Graf ist tot; ich führe die Burg bis zum Eintreffen des Marschalls. Die Männer sollen in Rüstung schlafen. Der Hauptmann meldet, die Toten in den Kasematten seien wieder aufgestanden. Ich habe befohlen, die Gitter zuzuschweißen. Möge Gott uns vergeben.",
  },
  gravedigger_ledger: {
    id: "gravedigger_ledger",
    title: "Register des Totengräbers",
    text: "Vierter Tag: 23 Gräber. Siebter Tag: 61. Zehnter Tag: Die Gruben reichen nicht mehr, wir werfen sie übereinander und streuen Kalk. Zwölfter Tag: Gestern Abend bewegte sich die Erde über der Massengrube. Der Abt sagt, es sei die Gärung. Vierzehnter Tag: Es ist nicht die Gärung. Ich habe meine Spitzhacke geschärft und die Kapelle verriegelt. Wer hier gräbt, grabe tief.",
  },
  abbot_journal: {
    id: "abbot_journal",
    title: "Tagebuch des Abts",
    text: "Die Brüder beten Tag und Nacht, doch die Seuche hört nicht auf Gebete. Ich habe die Tore schließen lassen, als die ersten Kranken aus der Stadt kamen. Sie schlugen an die Pforte, bis sie nicht mehr schlugen. Bruder Anselm hat den Kelch versteckt, bevor er starb. Heute Morgen stand er wieder im Chor und sang. Seine Augen leuchteten. Ich werde nicht fliehen. Wer diese Zeilen findet: Nehmt die Reliquien und bringt sie fort. Hier helfen sie niemandem mehr.",
  },
  catacomb_inscription: {
    id: "catacomb_inscription",
    title: "Inschrift aus den Katakomben",
    text: "Hier ruht Wenzel, erster Fürst von Königsmünde, der die Toten unter die Stadt legen ließ, damit die Lebenden Platz hätten. Hüte deine Schritte, Wanderer, denn die Fürsten schlafen leicht. – Darunter, mit Kohle gekritzelt: Sie schlafen nicht mehr. Nehmt den Schlüssel aus der Schatzkammer und flieht durch die Gruft. Lasst das Gold liegen. Das Gold ist der Köder.",
  },
  lost_letter: {
    id: "lost_letter",
    title: "Verlorener Brief an die Königin",
    text: "Majestät, die Stadt ist verloren. Der Hafen brennt, die Kathedrale ist voller Kranker, und die Garde hält nur noch den Palast. Der Marschall zieht sich nach Eisenwacht zurück und nimmt die letzten Gesunden mit. Ich flehe Euch an: Verlasst das Land über das Meer. Was hier geschieht, ist keine Krankheit. Die Toten gehorchen jemandem. Ich habe ihn gesehen, in der Nacht, auf dem Marktplatz, wie er die Hand hob und sie stillstanden. – Euer treuer Diener, Kanzler Odo.",
  },
  soldier_diary: {
    id: "soldier_diary",
    title: "Tagebuch eines Soldaten",
    text: "Eisenwacht, letzter Eintrag. Der Marschall lässt uns auf dem Exerzierplatz antreten, obwohl die Hälfte von uns schon hustet. Er sagt, Disziplin sei die einzige Mauer, die hält. Gestern sind die Toten aus dem Lazarett gekommen. Wir haben sie zurückgeschlagen, dann haben wir die Toten aus unseren Reihen zurückgeschlagen. Heute Nacht wird der Marschall selbst Wache stehen. Ich habe ihn husten hören. Wenn ihr das lest: Das Arsenal ist im Keller des Kommandanturgebäudes. Nehmt alles. Wir brauchen es nicht mehr.",
  },
}
