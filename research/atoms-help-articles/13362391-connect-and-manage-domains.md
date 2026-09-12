# Domain Management

- Source: https://help.atoms.dev/en/articles/13362391-connect-and-manage-domains
- Summary: Make your project stand out with a personalized custom domain.
- Updated: Jul 29, 2026

---

Personalize your project by connecting a custom domain (e.g., `yourname.com`) or customizing your free `.atoms.world` subdomain. This guide walks you through editing your default address, connecting a domain you already own, or buying a new one.

## Customize Your Free Subdomain

When you first publish a project, it is assigned a random subdomain (e.g., `1r945lo.atoms.world`).

1. Open your project and click **Update** in the top right corner.
2. In the **Publish** window, look for **Connected Domains** and click the **Edit** icon next to the current address.
3. Enter your desired name (e.g., alex) and click **Update**.

   ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F13362391%2F36eaaebe577f9a92-E6-88-AA-E5-B1-8F2026-01-11-19_46_46.png)
4. Your site is now live at your new subdomain (e.g., `alex.atoms.world`).

## Connect a Domain You Already Own

If you have purchased a domain from a provider (like Alibaba Cloud, GoDaddy, or Namecheap), follow these steps to connect it.

### Step 1: Start the Connection

1. Go to **Settings** and select the **Domains** tab from the sidebar.
2. Click on **Connect Existing Domain** (Must be a second-level domain, such as docs.example.com).

   ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F13362391%2F7d8595bed0c00167-connect-domain.png)
3. Enter your full domain name (e.g., xxx.`alex.com`) in the text box and click **Connect domain**.

### Step 2: Configure DNS Records

The system will attempt to identify your provider. If automatic connection isn't supported, you must update your DNS records manually.

1. Select **Manual Setup** if prompted.
2. The system will display two records you need to add to your domain provider's settings: an **A Record** and a **TXT Record**.

   - **A Record:** Point this to the IP address shown (e.g., `000.000.000.0`).
   - **TXT Record:** Add the specific verification string provided.

### Step 3: Update Your Provider

1. Log in to your domain registrar.
2. Navigate to the **DNS Settings** or **DNS Resolution** section for your domain.
3. Add the records exactly as shown in the Atoms setup screen:

   1. **Type:** A | **Value:** \[IP Address from Step 2\].
   2. **Type:** TXT | **Host:** `_mgx_verify` | **Value:** \[Verification Code from Step 2\].

      **Important:** The TXT record host differs for root domains and subdomains:

      Root domain:(e.g., `alex.com`): `_mgx_verify`

      Subdomain (e.g., `app.alex.com`): `_mgx_verify.app`

      Subdomain (e.g., `staging.alex.com`): `_mgx_verify.staging`
4. Save your changes.

### Step 4: Verify and Go Live

1. Return to the Atoms **Settings** page and click the button to confirm you have added the records.
2. Once configured, you will see a "You're all set!" message. Your domain status will change to **Live**.
3. Wait for the verification to complete.

**Note:** While DNS updates can take up to 48 hours to take effect globally, they usually complete much sooner.

1\. Verify an A record. Use the \`ping\` command to check if your domain resolves to our gateway IP address (**107.150.101.9**).

```
# e.g., root domain of your domain name ping <yourdomainname.com> # e.g., app subdomain of your domain name ping <app.yourdomainname.com>
```

2\. Verify TXT record.

```
# For root domain (yourdomainname.com) nslookup -type=TXT _mgx_verify.yourdomainname.com  # For subdomain (app.yourdomainname.com) nslookup -type=TXT _mgx_verify.app.yourdomainname.com
```

## Purchase a New Domain

If you do not yet own a domain, you can buy one directly through our settings.

1. Go to **Settings > Domains**.
2. Click **Purchase New Domain**.
3. Search for your desired name (e.g., `hhhh-hhhh.com`) to check availability and pricing.
4. Add the domain to your cart and complete the checkout process via our partner, IONOS.
5. Once purchased, follow the prompts to connect it to your project.

## Set a Primary Domain

If you have multiple domains connected (e.g., a free subdomain _and_ a custom domain), you should set one as the **Primary Domain**. This ensures that visitors are always redirected to your preferred address.

1. In **Settings > Domains**, locate the domain you want to be the main address.
2. Click the **Star icon** or select **Primary domain** next to that domain.
3. This ensures that traffic to your other addresses (like `alex.atoms.world`) will redirect to your custom domain (`alex.com`).

   <AccordionGroup>
   <Accordion title="Can I customize my domain?">
   At present, Atoms does not support binding custom domains. Projects cannot be deployed directly to your own website. You can modify part of the domain name (the Atoms suffix will remain).
   </Accordion>
   </AccordionGroup>
