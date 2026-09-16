-- W3 (T-23) a besoin de savoir, sans recalcul couteux, quels questionnaires
-- envoyes sont deja passes par leur relance unique : une colonne dediee,
-- directement interrogeable, plutot qu'une recherche dans le journal d'audit
-- (l'approche deja utilisee par T-22 pour les taches, mais qui exigerait ici
-- une jointure supplementaire pour chaque passage planifie).
alter table public.surveys
  add column reminder_sent_at timestamptz;

comment on column public.surveys.reminder_sent_at is
  'Horodatage de la relance unique envoyee si le questionnaire est reste sans reponse (W3, T-23). Jamais reecrite une deuxieme fois.';
