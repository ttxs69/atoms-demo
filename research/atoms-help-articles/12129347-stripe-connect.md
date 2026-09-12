# Stripe Connect

- Source: https://help.atoms.dev/en/articles/12129347-stripe-connect
- Summary: MGX now supports quick configuration of Stripe payments via Supabase Edge Functions.
- Updated: Jul 29, 2026

---

## Requirements

Before integrating Stripe, ensure you have:

- A working MGX application.
- The MGX project is already connected to a Supabase Project. ([Learn more about Supabase](https://help.atoms.dev/en/articles/12129788-supabase-connect).)
- Created products and corresponding prices in your **Stripe dashboard**.

**Note:** Preview mode cannot be used to test payment functionality. Deploy your MGX app and switch Stripe to Test Mode to verify integration.

**Test card:**

- Card Number: `4242 4242 4242 4242`
- Expiry date: Any future date
- CVC: Any 3-digit number

## Stripe Payment Setup

1. Connect Supabase

   - Click the Supabase button in the top-right of MGX
   - Follow the [Supabase Connect Guides](https://help.atoms.dev/en/articles/12129788-supabase-connect) to select your target Supabase Project
   - Once connected, you can configure payment settings via Supabase
2. Describe Your Subscription Requirements in Natural Language

   - Example: Create a payment system that supports three subscription plans at $4.99 per week, $14.99 per month, and $149.99 per year.

   After submitting, the MGX Agent will generate configuration buttons. You will need to fill in at least two fields.
3. Click the `Add Stripe Secret Key` Button

   ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12130240%2Fbf1e54e6b083876f-stripeImage_01.png)

   - Enter your Stripe secret key under the **STRIPE\_SECRET\_KEY** field.
   - For each plan, enter its corresponding Stripe Price ID in the field ending with PRICE\_ID.

   ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12130240%2F9067960b5a31a395-stripeImage_02.png)

   You can retrieve your Stripe secret key here: **[https://dashboard.stripe.com/test/apikeys](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12130240%2F93a721fc463b8db9-apikeys)**

   Navigate to **Product Catalog > Products**, get the price ID using either of the following methods:

   - In the "Pricing" list, click the “More” button to the right of the corresponding price, then click "Copy Price ID".

   ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12130240%2Fe0ab58eea27e8967-stripeImage_03.png)

   You can directly click the price name to open the detail page, then copy the price ID shown in the top-right corner.

   ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12130240%2Fb97b2917c7dff487-stripeImage_04-281-29.png)

   Finally, accurately paste each price ID into the corresponding input field.

   ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12130240%2Fe63ef0de5d17435e-stripeImage_05.png)

   **Note:** For privacy and security, never paste your secret key directly into the MGX chat. Exposure may allow unauthorized access to your Stripe account. Use MGX's **"Add API Key"** button to store it securely instead.
4. Click the `Add Stripe Webhook Secret Key` Button

   ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12130240%2F20d7a2e0e4faa59b-stripeImage_06.png)

   - Enter your Webhook Secret Key
5. How to Find Webhook Secret Key:

   In Stripe, click “Developers” in the lower-left corner, then select the Webhooks option.

   ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12130240%2F256802c3232951cd-stripeImage_07.png)

   On the Webhooks page, click the "Add destination" button.

   ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12130240%2Fa65d96cc6f0191df-stripeImage_08.png)

   Select the webhook events that match your project needs:

   - `checkout.session.async_payment_failed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.completed`
   - `checkout.session.expired`

   ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12130240%2Fdb778223f6bdf43d-stripeImage_09.png)

   After clicking "Continue", select "Webhook endpoint."

   ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12130240%2Fec2d2d652983b0f5-stripeImage_10.png)

   Enter the endpoint URL from Supabase.

   ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12130240%2F7659b959c42a0327-stripeImage_12.png)
6. How to Find Your Supabase Endpoint URL:

   Click `View Edge Function` in MGX.

   ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12130240%2F5610c84f9b40a9d7-stripeImage_13-281-29.png)

   - Click to select the edge function with the corresponding `_webhook` suffix.

     ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12130240%2Fb3986357aec54fcc-stripeImage_14.png)
   - In the Details panel of the corresponding edge function, copy the Endpoint URL and paste it into the Stripe Event Destination.

     ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12130240%2F44e1b3bfc0e38a6a-stripeImage_15.png)
7. Test Your Integration

   Use Stripe's Test Mode to test payments.

   Test card details:

   - Card number: 4242 4242 4242 4242
   - Any future expiration date
   - Any 3-digit CVC

## FAQ

<AccordionGroup>
<Accordion title="Why can't I test payments in Preview Mode?">
Preview Mode runs in a local environment, which does not provide a publicly accessible Webhook URL. You must deploy your app to receive Stripe events.
</Accordion>
<Accordion title="How do I switch to Production Mode?">
You can disable Test Mode in the Stripe Dashboard and use your live Secret Key and Webhook Secret.
</Accordion>
<Accordion title="How can I verify if a test payment was successful?">
After completing a test payment, go to the Payments page in Stripe to view your test transaction records.
</Accordion>
</AccordionGroup>
