import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Règles de confidentialité · Relais' };

export default function PrivacyPage() {
  return (
    // body est en overflow:hidden pour le canvas : cette page défile dans son propre conteneur
    <main className="h-screen overflow-auto bg-surface">
      <article className="mx-auto max-w-2xl px-4 py-12 space-y-4 leading-6">
        <h1 className="text-2xl font-semibold">Règles de confidentialité</h1>
        <p className="text-muted">Dernière mise à jour : 26 octobre 2026</p>
        <p>Relais est une application d&apos;automatisation à usage personnel. Elle permet à son propriétaire de créer des agents qui répondent sur WhatsApp, Telegram et par email.</p>
        <h2 className="text-lg font-semibold pt-2">Données Google utilisées</h2>
        <p>Avec votre autorisation, Relais accède à Gmail (lire, envoyer et marquer les messages), Google Sheets et Google Docs, uniquement pour exécuter les automatisations que vous configurez.</p>
        <h2 className="text-lg font-semibold pt-2">Stockage et partage</h2>
        <p>Les jetons d&apos;accès sont stockés chiffrés sur le serveur de l&apos;application. Aucune donnée n&apos;est vendue, partagée avec des tiers ni utilisée à des fins publicitaires. L&apos;utilisation des données reçues des API Google respecte les <a className="text-accent underline" href="https://developers.google.com/terms/api-services-user-data-policy">règles relatives aux données utilisateur des services d&apos;API Google</a>, y compris les exigences d&apos;utilisation limitée.</p>
        <h2 className="text-lg font-semibold pt-2">Révocation</h2>
        <p>Vous pouvez retirer l&apos;accès à tout moment depuis <a className="text-accent underline" href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p>
        <h2 className="text-lg font-semibold pt-2">Contact</h2>
        <p><a className="text-accent underline" href="mailto:bakouanebenezer00@gmail.com">bakouanebenezer00@gmail.com</a></p>
      </article>
    </main>
  );
}
