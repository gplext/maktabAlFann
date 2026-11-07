import { Link } from "wouter";
import { LegalPage } from "@/components/legal-page";
import { usePageMeta, SITE_NAME } from "@/lib/seo";
import { useContact, whatsappLink, prettyPhone } from "@/lib/contact";

export default function Privacy() {
  usePageMeta({ title: `Privacy Policy | ${SITE_NAME}`, description: "How Maktaba Al-Fann collects, uses, protects and deletes your personal information." });
  const { data: contact } = useContact();

  return (
    <LegalPage title="Privacy Policy" updated="7 November 2026"
      intro={<p>Maktaba Al-Fann (“we”, “us”) is an online art gallery based in Lahore, Pakistan. This policy explains what personal information we collect when you use our website, why we collect it, and the choices you have.</p>}>
      <section>
        <h2>1. What we collect</h2>
        <ul>
          <li><b>Account details</b> — your name, email address and, if you give it, your phone number, when you create an account or sign in.</li>
          <li><b>Order details</b> — the delivery name, phone number, address and city you give us, the artworks and items you order, and how you choose to pay.</li>
          <li><b>Enquiries and messages</b> — what you write to us through the website, WhatsApp or email.</li>
          <li><b>Artists and galleries</b> — profile information, biographies, photographs and artwork images you upload, and the details we need to pay you.</li>
          <li><b>Technical information</b> — a session cookie that keeps you signed in and holds your cart, and standard server logs (such as IP address, browser type and the pages requested) used to keep the site secure.</li>
        </ul>
      </section>
      <section>
        <h2>2. How we use it</h2>
        <ul>
          <li>To process, confirm and deliver your orders, including contacting you on WhatsApp or by phone to confirm an order and your address.</li>
          <li>To answer your enquiries and provide customer service.</li>
          <li>To show artists' and galleries' profiles and works on the website.</li>
          <li>To prevent fraud, protect accounts and keep the website working.</li>
          <li>To meet our legal, tax and accounting obligations.</li>
        </ul>
        <p>We do not sell your personal information, and we do not use it for third-party advertising.</p>
      </section>
      <section>
        <h2>3. Who we share it with</h2>
        <ul>
          <li><b>Delivery partners</b> — your name, phone number and address, so they can deliver your order.</li>
          <li><b>The artist or gallery</b> whose work you buy, only as far as needed to prepare and dispatch it.</li>
          <li><b>Payment providers</b> — if you pay by card or bank transfer, the payment is handled by the bank or payment provider under their own privacy terms.</li>
          <li><b>Hosting and backup providers</b> that store our website and its encrypted backups on our behalf.</li>
          <li><b>Authorities</b>, when the law requires it.</li>
        </ul>
      </section>
      <section>
        <h2>4. Cookies</h2>
        <p>We use a session cookie that is needed to sign you in and keep your cart. We do not use advertising cookies. If we add analytics in future, we will update this policy.</p>
      </section>
      <section>
        <h2>5. How we protect it</h2>
        <p>Personal details such as names, email addresses and phone numbers are stored encrypted. Access is limited to staff who need it for their work, and every staff sign-in is logged. The website is served over HTTPS, and backups are encrypted.</p>
      </section>
      <section>
        <h2>6. How long we keep it</h2>
        <p>We keep account details while your account is open. We keep order records for as long as tax and accounting rules require. Enquiries are kept only as long as they are useful to answer you. When information is no longer needed, we delete it.</p>
      </section>
      <section>
        <h2>7. Your choices and rights</h2>
        <p>You can ask us to show you the personal information we hold about you, to correct it, or to delete your account and the information linked to it, except where we must keep records by law. Contact us using the details below.</p>
      </section>
      <section>
        <h2>8. Children</h2>
        <p>The website is not intended for children under 18. Purchases must be made by an adult.</p>
      </section>
      <section>
        <h2>9. Changes to this policy</h2>
        <p>We may update this policy. The date at the top shows when it last changed.</p>
      </section>
      <section>
        <h2>10. Contact</h2>
        <p>
          For any privacy question or request, contact us
          {contact?.whatsapp ? <> on WhatsApp at <a href={whatsappLink(contact.whatsapp)} target="_blank" rel="noopener noreferrer">{prettyPhone(contact.whatsapp)}</a></> : null}
          {contact?.email ? <> or by email at <a href={`mailto:${contact.email}`}>{contact.email}</a></> : null}
          {" "}or through the <Link href="/about#contact">Our Story</Link> page.
        </p>
      </section>
    </LegalPage>
  );
}
