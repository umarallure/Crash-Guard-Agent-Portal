import { LegalPage } from '@/components/legal/LegalPage';

const Terms = () => {
  return (
    <LegalPage title="Terms &amp; Conditions" lastUpdated="June 10, 2026">
      <p className="ap-legal-lead">
        These Portal Terms govern your access to and use of the Agent Portal (the “Portal”), operated
        by Accident Payments (“Accident Payments,” “we,” “us,” or “our”). They supplement, and should
        be read together with, our company-wide{' '}
        <a href="https://www.accidentpayments.com/terms" target="_blank" rel="noopener noreferrer">
          Terms
        </a>
        . Where these Portal Terms and the company-wide terms differ with respect to the Portal, these
        Portal Terms control for Portal activities. If you do not agree, do not access or use the
        Portal.
      </p>

      <section>
        <h2>1. Eligibility and Accounts</h2>
        <p>
          The Portal is private and available by invitation only. By using it, you represent that you
          are at least 18 years old, are an authorized agent, closer, team member, or approved
          lead-vendor partner, and will provide accurate information. You are responsible for keeping
          your credentials confidential, for all activity under your account, and for promptly
          notifying us of any suspected unauthorized use.
        </p>
      </section>

      <section>
        <h2>2. The Portal</h2>
        <p>
          The Portal is a workspace for authorized users to manage lead intake and screening, call
          handling and dispositioning, deal-flow management, retainers and order fulfillment, task
          assignment, commissions, and performance reporting. We may add, change, suspend, or remove
          features at any time.
        </p>
      </section>

      <section>
        <h2>3. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>access or attempt to access accounts, data, or systems you are not authorized to use;</li>
          <li>interfere with, disrupt, or probe the security or functionality of the Portal;</li>
          <li>scrape, copy, or extract data except as the Portal is intended to be used;</li>
          <li>upload malicious code or unlawful, false, or misleading information; or</li>
          <li>
            use the Portal in violation of any law or your professional, ethical, or contractual
            obligations.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Lead Data and Confidentiality</h2>
        <p>
          You are responsible for the information you and your users submit to or access within the
          Portal. You represent that you have the authority and any required consents to handle lead,
          claimant, and third-party data, and you agree to keep all lead and matter information
          confidential and to use it only for legitimate, authorized business purposes. You are
          responsible for your users’ compliance with these Terms.
        </p>
      </section>

      <section>
        <h2>5. Intellectual Property and License</h2>
        <p>
          The Portal, including its software, design, and content, is owned by Accident Payments and
          its licensors and is protected by law. We grant you a limited, revocable, non-exclusive,
          non-transferable license to access and use the Portal for your authorized internal business
          purposes. You may not copy, modify, distribute, sell, reverse engineer, or create derivative
          works from the Portal except as permitted by law.
        </p>
      </section>

      <section>
        <h2>6. No Legal Advice; No Attorney–Client Relationship</h2>
        <p>
          The Portal is software for managing workflows and information. It does not provide legal
          advice, and your use of it does not create an attorney–client relationship with Accident
          Payments.
        </p>
      </section>

      <section>
        <h2>7. Third-Party Services</h2>
        <p>
          The Portal integrates third-party services (such as hosting, authentication, dialer, and
          support tools). Your use of those services may be subject to their own terms, and we are not
          responsible for third-party services.
        </p>
      </section>

      <section>
        <h2>8. Service Availability</h2>
        <p>
          The Portal is provided on an “as is” and “as available” basis. We do not guarantee that it
          will be uninterrupted, error-free, or secure, and we may perform maintenance or modify the
          service.
        </p>
      </section>

      <section>
        <h2>9. Disclaimer of Warranties</h2>
        <p>
          To the fullest extent permitted by law, Accident Payments disclaims all warranties, express
          or implied, including merchantability, fitness for a particular purpose, and
          non-infringement.
        </p>
      </section>

      <section>
        <h2>10. Limitation of Liability</h2>
        <p>
          To the fullest extent permitted by law, Accident Payments will not be liable for any
          indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost
          profits, revenue, data, or goodwill, arising out of or relating to your use of the Portal.
        </p>
      </section>

      <section>
        <h2>11. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless Accident Payments and its affiliates from claims,
          losses, and expenses (including reasonable legal fees) arising out of your use of the Portal,
          your data, or your violation of these Terms or applicable law.
        </p>
      </section>

      <section>
        <h2>12. Suspension and Termination</h2>
        <p>
          We may suspend or terminate your access at any time, including for breach of these Terms or
          to protect the Portal. On termination, your right to use the Portal ends. Provisions that by
          their nature should survive termination will survive.
        </p>
      </section>

      <section>
        <h2>13. Governing Law</h2>
        <p>
          These Terms are governed by and construed in accordance with the laws of the United States
          and the U.S. state in which Accident Payments is established, without regard to its
          conflict-of-laws provisions.
        </p>
      </section>

      <section>
        <h2>14. Changes to These Terms</h2>
        <p>
          We may update these Terms. We will revise the “Last updated” date above and, for material
          changes, provide notice through the Portal or by email. Continued use after changes take
          effect means you accept them.
        </p>
      </section>

      <section>
        <h2>15. Contact Us</h2>
        <p>
          Questions about these Terms can be directed to Accident Payments through{' '}
          <a href="https://www.accidentpayments.com" target="_blank" rel="noopener noreferrer">
            accidentpayments.com
          </a>
          {' '}or your portal administrator. For our full company-wide terms, see our{' '}
          <a href="https://www.accidentpayments.com/terms" target="_blank" rel="noopener noreferrer">
            Terms
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
};

export default Terms;
