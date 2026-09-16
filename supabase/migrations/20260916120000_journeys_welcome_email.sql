-- T-24 : l'email de bienvenue doit pouvoir joindre un employe qui n'a pas
-- encore de compte (donc pas d'entree dans auth.users). L'ATS est la seule
-- source de cette adresse au moment de l'embauche, au meme titre que
-- employee_name deja porte par cette table : ni l'une ni l'autre ne
-- transitent ensuite dans un payload de notification, elles sont lues ici au
-- moment de l'envoi.
--
-- welcome_email_sent_at rend l'envoi idempotent : le webhook differe qui
-- declenche T-24 peut etre rejoue (retry n8n) sans produire un second email,
-- et un report d'arrivee avant le premier envoi le reprogramme naturellement
-- puisque la date de declenchement est recalculee a chaque appel plutot que
-- figee dans un minuteur.

alter table public.journeys add column personal_email text;
alter table public.journeys add column welcome_email_sent_at timestamptz;
