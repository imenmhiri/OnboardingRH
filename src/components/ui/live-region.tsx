/**
 * Une confirmation qui change l'affichage sans navigation (materiel attribué,
 * document déposé, réception accusée) doit être annoncée, pas seulement
 * visible. Le nœud doit rester monté dans tous les états du composant qui
 * l'utilise : un nœud démonté au moment précis de l'annonce ne dit jamais
 * rien à un lecteur d'écran — défaut trouvé une première fois dans
 * `AcknowledgeEquipmentButton` (T-19), retrouvé à l'identique dans deux
 * autres fenêtres pendant la passe de cohérence T-20. Un seul composant
 * partagé, plutôt que la même correction copiée trois fois.
 */
export function LiveRegion({ message }: { readonly message: string }) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {message}
    </p>
  );
}
