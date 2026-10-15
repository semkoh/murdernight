// Scénario prêt à jouer, pour tester l'application ou faire la démo.
// "destinataire" = position du personnage dans la liste (0 = premier).
export const SCENARIO_EXEMPLE = {
  titre: "Meurtre au manoir Blackwood",
  victime: "Lord Edmund Blackwood",
  lieu: "Manoir Blackwood, Angleterre, 1924",
  scenario:
    "Ce soir, Lord Edmund Blackwood fêtait ses 70 ans entouré de ses proches. Vers 21 h 30, après avoir bu son verre de porto, il s'est effondré dans le grand salon. Le docteur n'a pu que constater le décès. Les portes du manoir sont fermées à cause de l'orage : le meurtrier est encore parmi vous.",
  personnages: [
    {
      nom: "Lady Margaret Blackwood",
      description: "L'épouse de Lord Blackwood, trente ans de moins que lui. Élégante, distante.",
      alibi: "Tu jouais du piano dans le salon de musique au moment du drame.",
      secret: "Tu as une liaison avec le Dr Moreau depuis deux ans.",
      objectif: "Cacher ta liaison à tout prix, et protéger le docteur s'il est soupçonné.",
      est_coupable: false,
    },
    {
      nom: "Victor Hale",
      description: "Le majordome, au service de la famille depuis 25 ans. Discret et loyal.",
      alibi: "Tu étais descendu à la cave chercher une bouteille de champagne.",
      secret: "Tu revends en cachette les bouteilles rares de la cave de Lord Blackwood.",
      objectif: "Garder ta place : personne ne doit découvrir les bouteilles manquantes.",
      est_coupable: false,
    },
    {
      nom: "Dr Henri Moreau",
      description: "Le médecin de famille. Il ne se sépare jamais de sa sacoche en cuir.",
      alibi: "Tu fumais un cigare seul dans le jardin d'hiver.",
      secret: "Lord Blackwood avait découvert ta liaison avec sa femme et menaçait de te ruiner.",
      objectif: "Prouver ton innocence : tu es le suspect idéal et tu le sais.",
      est_coupable: false,
    },
    {
      nom: "Clara Blackwood",
      description: "La nièce adorée, élevée au manoir. Ce soir, elle porte une robe verte.",
      alibi: "Tu dis être montée te reposer dans ta chambre à cause d'une migraine.",
      secret:
        "C'est toi la coupable. Tu as appris que ton oncle allait te déshériter demain. Tu as volé un flacon de somnifère dans la sacoche du docteur et tu l'as versé dans son porto.",
      objectif: "Ne pas te faire démasquer. Fais accuser le Dr Moreau : c'était son flacon.",
      est_coupable: true,
    },
    {
      nom: "Maître Paul Garnier",
      description: "Le notaire de la famille, invité pour l'anniversaire. Très à cheval sur les règles.",
      alibi: "Tu relisais des documents dans le bureau de Lord Blackwood.",
      secret: "Lord Blackwood t'avait demandé de modifier son testament demain matin.",
      objectif: "Ne révèle l'histoire du testament que si quelqu'un te pose directement la question.",
      est_coupable: false,
    },
    {
      nom: "Rose Miller",
      description: "La cuisinière. Elle connaît tous les secrets de la maison.",
      alibi: "Tu étais en cuisine pour préparer le dessert.",
      secret: "Tu as été renvoyée ce matin : tu partiras à la fin de la semaine.",
      objectif: "Découvrir le coupable, pour prouver ta valeur et retrouver ta place.",
      est_coupable: false,
    },
  ],
  indices: [
    { texte: "L'analyse du verre de porto révèle un puissant somnifère, à dose mortelle.", visibilite: "public", destinataire: null },
    { texte: "La sacoche du Dr Moreau a été fouillée : un flacon de somnifère a disparu.", visibilite: "public", destinataire: null },
    { texte: "Vers 21 h, tu as aperçu une silhouette en robe verte près du buffet des digestifs.", visibilite: "prive", destinataire: 5 },
    { texte: "Le testament devait être modifié demain. Une personne de la famille allait presque tout perdre.", visibilite: "public", destinataire: null },
    { texte: "En remontant de la cave, tu as entendu quelqu'un descendre l'escalier de service… alors que tout le monde était censé être au salon.", visibilite: "prive", destinataire: 1 },
    { texte: "Une robe verte tachée de porto a été retrouvée cachée sous un lit, au premier étage.", visibilite: "public", destinataire: null },
  ],
};

export const PERSONNAGE_VIDE = { nom: "", description: "", alibi: "", secret: "", objectif: "", est_coupable: false };
export const INDICE_VIDE = { texte: "", visibilite: "public", destinataire: null };
