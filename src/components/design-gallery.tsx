'use client';

import { MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, Input } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { StatusBadge, type StatusTone } from '@/components/ui/status';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';

const STATUSES: ReadonlyArray<{ tone: StatusTone; label: string }> = [
  { tone: 'neutral', label: 'À faire' },
  { tone: 'progress', label: 'En cours' },
  { tone: 'success', label: 'Terminée' },
  { tone: 'warning', label: 'Échéance proche' },
  { tone: 'danger', label: 'En retard' },
  { tone: 'cancelled', label: 'Annulée' },
];

export function DesignGallery() {
  const [email, setEmail] = useState('');
  const invalid = email.length > 0 && !email.includes('@');

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Actions" description="Quatre intentions, trois tailles." />
          <CardBody className="flex flex-wrap items-center gap-3">
            <Button>
              <Plus aria-hidden className="size-4" />
              Créer un parcours
            </Button>
            <Button variant="secondary">Dupliquer</Button>
            <Button variant="ghost">Annuler</Button>
            <Button variant="danger">Supprimer</Button>
            <Button loading>Enregistrement</Button>
            <Button disabled>Indisponible</Button>
            <Tooltip label="Le raccourci clavier est Maj + N">
              <Button variant="secondary" size="sm" aria-label="Aide sur la création">
                <MoreHorizontal aria-hidden className="size-4" />
              </Button>
            </Tooltip>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Saisie" description="Label, aide et erreur liés au contrôle." />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Email professionnel"
              description="Utilisé pour les notifications de tâches."
              required
              {...(invalid ? { error: 'Cette adresse ne contient pas de @.' } : {})}
            >
              <Input
                type="email"
                placeholder="prenom.nom@societe.fr"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label="Site de rattachement" description="Détermine les jours fériés appliqués.">
              <Select>
                <SelectTrigger placeholder="Choisir un site" aria-label="Site de rattachement" />
                <SelectContent>
                  <SelectItem value="lille">Siège de Lille</SelectItem>
                  <SelectItem value="strasbourg">Agence de Strasbourg</SelectItem>
                  <SelectItem value="dubai">Bureau de Dubaï</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Statuts" description="Icône et texte, jamais la couleur seule." />
          <CardBody className="flex flex-wrap gap-2">
            {STATUSES.map((status) => (
              <StatusBadge key={status.tone} tone={status.tone} label={status.label} />
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="États d’écran" description="Vide, chargement et erreur, dessinés une fois." />
          <CardBody>
            <Tabs defaultValue="empty">
              <TabsList>
                <TabsTrigger value="empty">Vide</TabsTrigger>
                <TabsTrigger value="loading">Chargement</TabsTrigger>
                <TabsTrigger value="error">Erreur</TabsTrigger>
              </TabsList>
              <div className="pt-4">
                <TabsContent value="empty">
                  <EmptyState
                    title="Aucune arrivée prévue cette semaine"
                    description="Les prochaines embauches validées apparaîtront ici dès leur enregistrement."
                    action={<Button size="sm">Créer un parcours</Button>}
                  />
                </TabsContent>
                <TabsContent value="loading">
                  <SkeletonList rows={3} />
                </TabsContent>
                <TabsContent value="error">
                  <ErrorState description="Le service est momentanément indisponible. Réessayez dans quelques instants." />
                </TabsContent>
              </div>
            </Tabs>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Superpositions" description="Fenêtre et menu, pilotés au clavier." />
          <CardBody className="flex flex-wrap gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">Reporter l’arrivée</Button>
              </DialogTrigger>
              <DialogContent
                title="Reporter la date d’arrivée"
                description="Toutes les échéances du parcours seront recalculées en jours ouvrés."
                footer={
                  <>
                    <DialogClose asChild>
                      <Button variant="ghost">Annuler</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button>Recalculer</Button>
                    </DialogClose>
                  </>
                }
              >
                <Field label="Nouvelle date d’arrivée">
                  <Input type="date" defaultValue="2026-04-07" />
                </Field>
              </DialogContent>
            </Dialog>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">Actions sur la tâche</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Compte IT</DropdownMenuLabel>
                <DropdownMenuItem>Marquer comme terminée</DropdownMenuItem>
                <DropdownMenuItem>Réattribuer</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-danger">Annuler la tâche</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardBody>
        </Card>
      </div>
    </TooltipProvider>
  );
}
