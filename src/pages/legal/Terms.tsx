import { Link } from "react-router-dom";
import LegalLayout, { H2, List } from "./LegalLayout";
import { LEGAL_INFO } from "../../data/legal";

// Section 7's refund terms follow the compliance addendum's recommendation
// (§5); confirm them before paid plans launch, and show them again at
// checkout — the addendum requires stating them there, not just here.
export default function TermsPage() {
  const { companyName, supportEmail, venueCity } = LEGAL_INFO;
  return (
    <LegalLayout title="Terms of Service">
      <p>
        These Terms of Service ("Terms") govern your use of Invyta, operated by {companyName} ("Invyta", "we", "us"). By creating an
        account or using Invyta, you agree to these Terms and to our <Link to="/privacy" className="underline">Privacy Policy</Link>.
        If you do not agree, please do not use Invyta.
      </p>

      <H2>1. Who can use Invyta</H2>
      <p>
        You must be at least 18 years old to create an account. You are responsible for keeping your login details secure and for
        everything that happens under your account. Tell us right away at {supportEmail} if you believe your account has been accessed
        without your permission.
      </p>

      <H2>2. Your responsibilities as an organizer</H2>
      <p>When you create an event and collect RSVPs, you decide what guest information is collected and why. That means you:</p>
      <List
        items={[
          "act as the personal information controller for your guest list under the Data Privacy Act, with Invyta processing it on your behalf;",
          "must have a lawful basis to add people's information to your guest list, and must use it only to manage your event;",
          "must get a parent's or guardian's consent before adding a minor's information; and",
          "must handle guests' requests about their information (for example, to correct or remove their RSVP), with our help where needed.",
        ]}
      />

      <H2>3. Acceptable use</H2>
      <p>You may not use Invyta to create, upload or share content that:</p>
      <List
        items={[
          "is for an event that does not exist, or is used to deceive people — including scams, fake fundraisers, or collecting money under false pretenses;",
          "impersonates another person or organization, or misrepresents your connection to them;",
          "is hateful, harassing, threatening, sexually explicit, or promotes violence or illegal activity;",
          "is commercial spam or unsolicited advertising;",
          "infringes someone else's copyright, trademark, privacy or other rights, including uploading photos you don't have permission to use; or",
          "contains other people's personal information without a lawful basis.",
        ]}
      />
      <p>You also may not attempt to access other users' data, disrupt the service, get around plan limits, or reverse-engineer Invyta except as allowed by law.</p>

      <H2>4. Your content</H2>
      <p>
        You keep ownership of the content you add to Invyta, such as text and photos. You give us a limited, non-exclusive, royalty-free
        license to host, store, display and adapt it (for example, resizing photos) only as needed to run the service for you. This license
        ends when you delete the content or your account, except for copies we must keep by law. Published invitations can be viewed by
        anyone who has the link, so only share links with people you intend to invite.
      </p>

      <H2>5. Reports and enforcement</H2>
      <p>
        If you believe an invitation breaks these Terms, <Link to="/contact?category=report" className="underline">report it here</Link> or email {supportEmail}. We review reports and may remove content, unpublish an
        invitation, or suspend or close an account that violates these Terms, with or without notice where the violation is serious (for
        example, fraud or content that puts people at risk).
      </p>

      <H2>6. Plans and features</H2>
      <p>
        Invyta offers a Free plan and paid plans with additional features and higher limits, as described on our pricing page. We may change
        plan features and limits; changes to a paid plan you have already bought will not reduce what you paid for during its term.
      </p>

      <H2>7. Payments and refunds</H2>
      <p>
        Paid plans are bought per event, as a one-time payment in Philippine pesos through PayMongo, a licensed payment processor; we do not
        store your card details. Prices and what each plan includes are shown before you pay, and an upgrade applies only to the event it was
        bought for. A purchase for an event is refundable if you request it within 24 hours and the invitation has
        not been published or sent to guests; once it has been published or guests have been invited, it is non-refundable, except where the
        law requires otherwise. Official receipts are issued for paid transactions.
      </p>

      <H2>8. Availability and changes</H2>
      <p>
        We work to keep Invyta available and reliable, but we do not guarantee it will always be uninterrupted or error-free. We may update,
        change or discontinue features. Keep your own copy of important event information, such as your final guest list.
      </p>

      <H2>9. Disclaimers and limitation of liability</H2>
      <p>
        Invyta is provided "as is" and "as available". To the fullest extent permitted by Philippine law, we are not liable for indirect,
        incidental or consequential damages, or for losses caused by events outside our reasonable control, and our total liability for any
        claim relating to Invyta is limited to the amount you paid us in the 12 months before the claim. Nothing in these Terms limits
        liability that cannot be limited by law, including liability for fraud, gross negligence, or your rights under the Data Privacy Act.
      </p>

      <H2>10. Ending your account</H2>
      <p>
        You can delete your account at any time in Settings. Deleting it permanently removes your events, invitations, guest lists and uploaded
        photos, and published invitation links stop working. We may suspend or close accounts as described in section 5.
      </p>

      <H2>11. Governing law</H2>
      <p>
        These Terms are governed by the laws of the Republic of the Philippines. Disputes will be brought before the proper courts of {venueCity},
        without prejudice to any rights you have under consumer protection laws.
      </p>

      <H2>12. Changes to these Terms</H2>
      <p>
        We may update these Terms. We will post the new version here and update the date above, and notify organizers of material changes
        before they take effect. Continuing to use Invyta after that means you accept the updated Terms.
      </p>

      <H2>13. Contact</H2>
      <p>Questions about these Terms: {supportEmail}</p>
    </LegalLayout>
  );
}
