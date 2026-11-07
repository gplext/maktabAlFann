import { Link } from "wouter";
import { LegalPage } from "@/components/legal-page";
import { usePageMeta, SITE_NAME } from "@/lib/seo";

export default function Terms() {
  usePageMeta({ title: `Terms & Conditions | ${SITE_NAME}`, description: "The terms for using Maktaba Al-Fann and for buying, selling and showing artworks on it." });

  return (
    <LegalPage title="Terms & Conditions" updated="7 November 2026"
      intro={<p>These terms apply to everyone who uses the Maktaba Al-Fann website, including buyers, artists and galleries. By using the website or placing an order, you agree to them. Please also read our <Link href="/privacy">Privacy Policy</Link>.</p>}>
      <section>
        <h2>1. About us</h2>
        <p>Maktaba Al-Fann is an online gallery based in Lahore, Pakistan, that presents and sells works by Pakistani artists, either directly or on behalf of artists and partner galleries.</p>
      </section>
      <section>
        <h2>2. Accounts</h2>
        <ul>
          <li>You must be at least 18 years old to create an account or place an order.</li>
          <li>Keep your sign-in details private. You are responsible for activity on your account.</li>
          <li>We may suspend accounts that are used for fraud, abuse or in breach of these terms.</li>
        </ul>
      </section>
      <section>
        <h2>3. Artworks, images and descriptions</h2>
        <ul>
          <li>Most works are original and one of a kind. We describe each work's medium, size, year and condition as accurately as we can.</li>
          <li>Colours on screen can differ from the real work, and sizes are approximate unless stated.</li>
          <li>Buying an artwork gives you ownership of the physical work. Copyright stays with the artist: you may not reproduce the image for commercial use without the artist's permission.</li>
        </ul>
      </section>
      <section>
        <h2>4. Prices and payment</h2>
        <ul>
          <li>Prices are shown in Pakistani Rupees (PKR). Frames, delivery and other extras are shown separately before you confirm.</li>
          <li>We may correct a price that is shown wrongly before we confirm your order.</li>
          <li>We accept the payment methods shown at checkout, such as cash on delivery or bank transfer.</li>
        </ul>
      </section>
      <section>
        <h2>5. Orders</h2>
        <ul>
          <li>An order is a request to buy. It is accepted only when we confirm it with you, usually on WhatsApp, together with your delivery address.</li>
          <li>Because most works are unique, a work may sell to someone else before your order is confirmed. If so, we will tell you and you will not be charged.</li>
          <li>You can cancel an order at no cost before it is dispatched.</li>
        </ul>
      </section>
      <section>
        <h2>6. Delivery</h2>
        <ul>
          <li>We deliver across Pakistan and, on request, internationally. Delivery times are estimates.</li>
          <li>Works are packed to protect them in transit. Please check your order when it arrives.</li>
          <li>For cash on delivery, payment is made to the courier when you receive the order.</li>
        </ul>
      </section>
      <section>
        <h2>7. Damage, returns and refunds</h2>
        <ul>
          <li>If a work arrives damaged or is not as described, contact us promptly with photographs of the work and its packaging. We will arrange a repair, replacement where possible, or a refund.</li>
          <li>Because works are original pieces, we cannot accept returns for change of mind once an order has been delivered, unless agreed with us in writing.</li>
          <li>Refunds are paid back by the method you used, or by bank transfer for cash-on-delivery orders.</li>
        </ul>
      </section>
      <section>
        <h2>8. Artists and galleries</h2>
        <ul>
          <li>By submitting a work, you confirm that you made it or have the right to sell it, and that its description is accurate.</li>
          <li>You allow Maktaba Al-Fann to show the work's images and details on the website and in its promotion while the work is listed, and as part of the record of past sales.</li>
          <li>Commission and payment terms are agreed with each artist or gallery separately. We may decline or remove a listing at our discretion.</li>
        </ul>
      </section>
      <section>
        <h2>9. Acceptable use</h2>
        <p>Do not misuse the website: no attempts to break its security, copy its content in bulk, upload unlawful or infringing material, or impersonate anyone.</p>
      </section>
      <section>
        <h2>10. Liability</h2>
        <p>We take reasonable care to run the website and fulfil orders. To the extent the law allows, our liability for any order is limited to the amount you paid for it, and we are not responsible for indirect losses.</p>
      </section>
      <section>
        <h2>11. Governing law</h2>
        <p>These terms are governed by the laws of Pakistan. Disputes will be handled by the courts of Lahore.</p>
      </section>
      <section>
        <h2>12. Changes and contact</h2>
        <p>We may update these terms; the date at the top shows the latest version. Questions? Get in touch through the <Link href="/about#contact">Our Story</Link> page.</p>
      </section>
    </LegalPage>
  );
}
