import { LegalPage } from '@/components/legal/LegalPage';

const PrivacyPolicy = () => {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="June 10, 2026">
      <p className="ap-legal-lead">
        This Privacy Notice explains how Accident Payments (“Accident Payments,” “we,” “us,” or “our”)
        handles information within the Agent Portal (the “Portal”) — a private, invite-only workspace
        provided to agents, closers, authorized team members, and approved lead-vendor partners. It
        supplements, and should be read together with, our company-wide{' '}
        <a
          href="https://www.accidentpayments.com/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </a>
        . Where this notice and the company-wide policy differ with respect to the Portal, this notice
        controls for Portal activities.
      </p>

      <section>
        <h2>1. Information We Collect</h2>
        <ul>
          <li>
            <strong>Account &amp; profile data</strong> — your name, work email, assigned role, and
            authentication credentials.
          </li>
          <li>
            <strong>Lead &amp; matter data you handle</strong> — claimant and lead contact details,
            accident and incident facts, injury and treatment information, healthcare providers,
            uploaded documents, call results and dispositions, retainer and order-fulfillment status,
            and commission records.
          </li>
          <li>
            <strong>Usage &amp; device data</strong> — IP address, browser and device type, pages
            viewed, actions taken, and timestamps, collected through server logs and essential
            cookies.
          </li>
          <li>
            <strong>Support communications</strong> — messages you send us through in-portal tools or
            by email.
          </li>
        </ul>
      </section>

      <section>
        <h2>2. How We Use Information</h2>
        <p>We use information to:</p>
        <ul>
          <li>authenticate users and keep the Portal and accounts secure;</li>
          <li>
            provide and operate Portal features (lead intake and screening, call handling, deal-flow
            management, retainers and order fulfillment, task assignment, commissions, and reporting);
          </li>
          <li>maintain availability, integrity, and performance;</li>
          <li>provide support and respond to your requests;</li>
          <li>detect, prevent, and investigate fraud, abuse, or security incidents; and</li>
          <li>comply with our legal obligations and enforce our agreements.</li>
        </ul>
      </section>

      <section>
        <h2>3. Roles and Responsibilities</h2>
        <p>
          Accident Payments decides what lead and claimant information is processed in the Portal and
          why, and acts as the <strong>controller</strong> for that information. Where you access the
          Portal as an approved lead-vendor partner or on behalf of another organization, each party
          is responsible for ensuring it has a lawful basis and any required consents or
          authorizations before submitting personal information about leads, claimants, or other third
          parties.
        </p>
      </section>

      <section>
        <h2>4. Sensitive and Health-Related Information</h2>
        <p>
          The Portal may contain injury, medical, and treatment details relating to accident
          claimants. We treat this information as confidential, restrict access through role-based
          permissions, and process it only to operate the Portal and our business. You remain
          responsible for handling such information in accordance with applicable laws and your
          professional obligations.
        </p>
      </section>

      <section>
        <h2>5. How We Share Information</h2>
        <p>We share information only as needed to operate the Portal and our business:</p>
        <ul>
          <li>within Accident Payments, according to each user’s role and permissions;</li>
          <li>
            with the attorneys, firms, carriers, or partners to whom a lead or matter is referred or
            assigned through the service;
          </li>
          <li>
            with the service providers and sub-processors that host and support the Portal (see
            Section 6), under contracts requiring appropriate safeguards; and
          </li>
          <li>
            when required by law or legal process, or to protect the rights, safety, and security of
            users and the Portal.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> sell personal information, and we do not use Portal lead data for
          advertising.
        </p>
      </section>

      <section>
        <h2>6. Service Providers and Sub-processors</h2>
        <p>
          We rely on a limited set of trusted providers to deliver the Portal, which may include, for
          example: <strong>Supabase</strong> (authentication, database, and file storage), our{' '}
          <strong>application hosting</strong> provider, and integrated <strong>dialer and support</strong>{' '}
          tools. These providers process data on our behalf under their respective terms and
          data-protection commitments.
        </p>
      </section>

      <section>
        <h2>7. Cookies and Similar Technologies</h2>
        <p>
          The Portal uses cookies and similar technologies that are strictly necessary to sign you in,
          keep your session secure, and remember your preferences, along with limited,
          privacy-respecting analytics that help us keep the Portal reliable. You can control cookies
          through your browser, but disabling essential cookies may prevent the Portal from working.
        </p>
      </section>

      <section>
        <h2>8. Data Security</h2>
        <p>
          We protect information using encryption in transit, role-based access controls,
          least-privilege permissions, session timeouts, and audited infrastructure. No system is
          perfectly secure. You are responsible for safeguarding your credentials and for promptly
          notifying us of any suspected unauthorized access.
        </p>
      </section>

      <section>
        <h2>9. Data Retention</h2>
        <p>
          We retain information for as long as your account and your relationship with us remain
          active, and afterward only as needed to comply with legal, accounting, or reporting
          obligations, resolve disputes, and enforce our agreements. We delete or de-identify
          information when it is no longer required.
        </p>
      </section>

      <section>
        <h2>10. Your Privacy Rights</h2>
        <p>
          Depending on where you live, you may have rights to access, correct, delete, restrict, or
          port your personal information, and to object to or withdraw consent for certain processing.
          To exercise rights regarding your own account information, contact us through{' '}
          <a href="https://www.accidentpayments.com" target="_blank" rel="noopener noreferrer">
            accidentpayments.com
          </a>
          {' '}or your portal administrator. We will not discriminate against you for exercising these
          rights.
        </p>
        <ul>
          <li>
            <strong>California residents (CCPA/CPRA):</strong> we do not sell or “share” personal
            information for cross-context behavioral advertising.
          </li>
          <li>
            <strong>EEA/UK residents (GDPR):</strong> our lawful bases include performing our
            contract with you, our legitimate interests in operating and securing the Portal, and
            compliance with legal obligations.
          </li>
        </ul>
      </section>

      <section>
        <h2>11. International Data Transfers</h2>
        <p>
          Accident Payments is based in the United States, and information is processed and stored in
          the United States. If you access the Portal from outside the United States, you understand
          that your information will be transferred to and processed there.
        </p>
      </section>

      <section>
        <h2>12. Children’s Privacy</h2>
        <p>
          The Portal is a business tool intended only for authorized adult professionals. It is not
          directed to children, and we do not knowingly collect personal information from anyone under
          18 through the Portal.
        </p>
      </section>

      <section>
        <h2>13. Changes to This Notice</h2>
        <p>
          We may update this notice from time to time. We will revise the “Last updated” date above
          and, for material changes, provide notice through the Portal or by email.
        </p>
      </section>

      <section>
        <h2>14. Contact Us</h2>
        <p>
          Questions about this notice or our privacy practices can be directed to Accident Payments
          through{' '}
          <a href="https://www.accidentpayments.com" target="_blank" rel="noopener noreferrer">
            accidentpayments.com
          </a>
          {' '}or your portal administrator. For our full company-wide policy, see our{' '}
          <a
            href="https://www.accidentpayments.com/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
};

export default PrivacyPolicy;
