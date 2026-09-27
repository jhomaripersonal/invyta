import { Link } from "react-router-dom";
import LegalLayout, { H2, List } from "./LegalLayout";
import { LEGAL_INFO } from "../../data/legal";

// Written to describe what the app actually does today (what's collected,
// where it's stored, what's retained and how it's deleted). When behavior
// changes — payments, SMS/email reminders, automatic retention cleanup,
// analytics — update the matching section here in the same change.
export default function PrivacyPolicyPage() {
  const { companyName, address, privacyEmail, dpoName } = LEGAL_INFO;
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        This Privacy Policy explains how {companyName} ("Invyta", "we", "us") collects, uses, shares and protects personal
        information when you use Invyta to create digital invitations, or when you view or respond to an invitation someone sent you.
        We process personal information in accordance with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173), its
        Implementing Rules and Regulations, and issuances of the National Privacy Commission (NPC).
      </p>

      <H2>1. Our role</H2>
      <List
        items={[
          <><strong>Organizers</strong> (people who create an Invyta account): we are the personal information controller for your account information.</>,
          <><strong>Guests</strong> (people invited to an event): the organizer who invited you decides what guest information to collect and how to use it, and is the personal information controller for their guest list. We process that information on the organizer's behalf, as a personal information processor, to provide the invitation and RSVP service.</>,
        ]}
      />

      <H2>2. Information we collect</H2>
      <p><strong>From organizers:</strong></p>
      <List
        items={[
          "Name and email address, and a password (stored only in hashed form by our authentication provider). If you sign in with Google, we receive your name and email address from Google.",
          "Event details you enter, such as the event name, host, date, time, venue, description, dress code and contact details.",
          "Invitation content, photos and background music you upload.",
          "Guest lists you add or import.",
          "If you choose to share a testimonial: its text, your rating, and the name and event description you choose to show with it, plus when you consented.",
          "The plan of each of your events, and a record of each payment you make (what was bought, the amount, the payment method type such as GCash or card, and its status). Payments are handled by PayMongo, a BSP-licensed payment processor; we never receive or store your card number or e-wallet login.",
        ]}
      />
      <p><strong>From guests:</strong></p>
      <List
        items={[
          "Your name and, if you or the organizer provide them, your email address and phone number.",
          "Your RSVP response, the number of people in your party, answers to any questions the host adds to the RSVP form, and any message you leave for the host.",
          "Whether you have been checked in at the event.",
        ]}
      />
      <p><strong>Automatically:</strong> when you use Invyta, our hosting and service providers process technical information needed to deliver the service, such as your IP address, browser type and device information.</p>

      <H2>3. How we use information</H2>
      <List
        items={[
          "To create and manage your account and sign you in.",
          "To build, publish and display invitations, and to collect and show RSVPs to the event's organizer.",
          "To provide guest management features such as guest lists, personalized links, QR check-in and guest-list export. RSVP reminders are sent by the organizer from their own messaging apps or email; Invyta itself does not message guests.",
          "To keep the service secure, prevent abuse and fraud, and enforce our Terms of Service.",
          "To respond to your requests and send you service messages, such as password resets.",
          "To comply with legal obligations.",
        ]}
      />
      <p>We do not sell personal information, and we do not use it for advertising.</p>

      <H2>4. Legal basis</H2>
      <p>
        We process organizer information to perform our agreement with you (providing the service you signed up for), and guest
        information on the instructions of the organizer, who is responsible for having a lawful basis to collect it. We also process
        information where needed for our legitimate interests in keeping Invyta secure and working, where required by law, and, where
        applicable, with consent.
      </p>

      <H2>5. Who can see your information</H2>
      <List
        items={[
          <><strong>Published invitations</strong> can be viewed by anyone who has the link. Photos and music uploaded to an invitation are stored so that anyone with the invitation or file link can load them.</>,
          <><strong>Guest lists and RSVP responses</strong> are visible only to the organizer of that event. Guests cannot see other guests' information.</>,
          <><strong>Testimonials</strong> you share are shown publicly on our website only after we review them, and only with the name and event description you entered. You can remove yours at any time in Settings.</>,
          <><strong>Service providers</strong> that host and run Invyta for us: Supabase (database, authentication and file storage), Vercel (website hosting), and PayMongo (payment processing, when you upgrade an event). Images from Unsplash may be displayed on invitations and are loaded from Unsplash's servers. If an invitation shows a map of the venue, the map is loaded from Google Maps, which receives the venue address and the viewer's technical information. If an invitation includes a video, the video is played from YouTube, Vimeo or Facebook — only once the viewer presses play — and that platform then receives the viewer's technical information under its own privacy policy. If you sign in with Google, Google processes that sign-in.</>,
          <><strong>Authorities</strong>, when we are required to by law or to protect the rights and safety of users and the public.</>,
        ]}
      />
      <p>Our service providers may store and process information on servers located outside the Philippines. We require them to protect it with safeguards comparable to those required under Philippine law.</p>

      <H2>6. How long we keep information</H2>
      <List
        items={[
          "Account information is kept while your account is active.",
          "Events, invitations, guest lists and uploaded photos and music are kept until the organizer deletes them, or deletes their account.",
          "When an organizer deletes their account, their events, guest lists, RSVPs and uploaded photos and music are deleted immediately.",
          "Payment records are kept for 5 years, as required for tax record-keeping in the Philippines — including after you delete your account, when they're kept without being linked to it.",
        ]}
      />

      <H2 id="cookies">7. Cookies and local storage</H2>
      <p>
        Invyta does not use advertising or analytics cookies. We use your browser's local storage only for things the service needs to
        work: keeping you signed in, and remembering small preferences such as which notifications you have already seen. You can clear
        this at any time in your browser settings; doing so will sign you out.
      </p>

      <H2>8. Your rights</H2>
      <p>Under the Data Privacy Act, you have the right to:</p>
      <List
        items={[
          "be informed about how your personal information is processed;",
          "access the personal information we hold about you;",
          "correct inaccurate or incomplete information;",
          "object to processing, and to have your information blocked, removed or destroyed;",
          "obtain a copy of your information in a portable format;",
          "be compensated for damages caused by unlawful processing; and",
          "file a complaint with the National Privacy Commission.",
        ]}
      />
      <p>
        <strong>Organizers</strong> can update their name and password in Settings, and permanently delete their account there at any time.
        {" "}<strong>Guests</strong> can ask the event's organizer to correct or delete their RSVP, or contact us directly — we will help, and
        coordinate with the organizer where needed. To make a request, use our <Link to="/contact?category=privacy" className="underline">privacy request form</Link> or email us at {privacyEmail}. We may need to verify your identity
        before acting on a request.
      </p>

      <H2>9. Security</H2>
      <p>
        We protect personal information with organizational, physical and technical measures, including encrypted connections (HTTPS),
        hashed passwords, and database access rules that restrict each guest list to its event's organizer. No system is perfectly secure;
        if a personal data breach occurs that is likely to put you at risk, we will notify the National Privacy Commission and affected
        individuals within 72 hours of becoming aware of it, as required by law.
      </p>

      <H2>10. Children</H2>
      <p>
        You must be at least 18 years old to create an Invyta account. Invitations may be about or sent to minors (for example, a child's
        birthday). Organizers are responsible for having a parent's or guardian's consent before adding a minor's information to a guest list.
      </p>

      <H2>11. Changes to this policy</H2>
      <p>
        We may update this policy from time to time. We will post the new version here and update the date above. If a change materially
        affects how we use your information, we will notify organizers by email or in the app before it takes effect.
      </p>

      <H2>12. Contact us</H2>
      <p>
        {companyName}<br />
        {address}<br />
        Data Protection Officer: {dpoName}<br />
        Email: {privacyEmail}
      </p>
      <p>See also our <Link to="/terms" className="underline">Terms of Service</Link>.</p>
    </LegalLayout>
  );
}
