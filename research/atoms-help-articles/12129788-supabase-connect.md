# Supabase Connect

- Source: https://help.atoms.dev/en/articles/12129788-supabase-connect
- Summary: With Supabase, you can easily configure a backend for your websites—no development experience needed.
- Updated: Jul 29, 2026

---

## Overview

Supabase is an open-source backend platform that enables users to store data and provide backend-like functionality. You can connect with Supabase to solve the problem that your Atoms team only stores in the browser's memory, which can be lost upon refresh or closure. By integrating Atoms with Supabase, you can transform your website into a fully functional application with persistent storage and advanced features.

See more instructions here:

<iframe src="https://www.youtube.com/embed/iQclR5N5b40?rel=0" frameborder="0" webkitallowfullscreen="" mozallowfullscreen="" allowfullscreen="" allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>

## Key Advantages

Other than no development experience needed, it still has three more key advantages:

1. **Quick Setup:** Get your backend up and accelerate your development process.
2. **Highly Scalable:** Adapt to user growth, allowing your project to expand without limitations.
3. **Cost-Effective:** Offers a free tier ideal for small projects and startups.

## Connecting Supabase to Atoms

Here is a short guide to connect Atoms with Supabase.

1. **Start the Supabase Integration in Atoms**

   - Open **Settings**.
   - Select **Connectors** from the left sidebar.
   - Find the Supabase connector and click **Connect**.

     ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12129788%2Fd59562b107515cca-image.png)
   - Atoms will present a connection setup interface that you can follow.
2. **Authenticate and Configure Your Project**

   A pop-up will appear, prompting you to sign in to your Supabase account.

   - Select your organization from the dropdown menu.
   - Click **Authorize Atoms** to authorize your Supabase account. _(Connection completes in seconds – no manual configuration needed)_
   - Once authorized, you can:

     - Choose an existing Supabase project from the list, or
     - Click +**Add New One** to add a new organization instantly. _(If you need guidance, the Atoms Assistant is available to walk you through Connecting Supabase to Atoms.)_
3. **Automatic Configuration**

   - Once your project is selected, Atoms will automatically connect to your Supabase project. It will gather your database structure, tables, and security settings.
   - When you see the "**Supabase Connected**" notification, your backend is fully configured and ready for use.

## User Authentication

After creating your app in Atoms, you might want to implement user authentication. Supabase Auth simplifies adding authentication and authorization to your app. In this process, Atoms will guide you through two methods: (1) **Email and Password** and (2) **Social Logins (Google)**.

### Email and Password

1. Connect Supabase with Atoms

   - Ensure you have a valid Supabase account.
   - Click the authorization button in the top-right corner of the chat interface to authorize your Supabase account.
   - Select the Supabase project you want to use.
2. Tell the Agents Your Requirements

   - Input your requirements in the chat. For example, you can simply prompt: "Add authentication".
   - This will typically generate a basic login and registration page connected to Supabase's authentication system.
3. Create Users for Testing

   - Use the newly added login/registration interface to create a test user.
   - Refresh the page to verify that the user session persists.
   - Alternatively, go to your Supabase dashboard, navigate to **Authentication** > **Users**, and manually add a user for testing.
4. Deploy Your App

### Social Logins (Google)

1. Configure Google OAuth in the Supabase Project

   - Navigate to the Authentication page in your Supabase dashboard.
   - Go to the Sign In/Up subpage.
   - Locate the Google option and toggle the switch to enable it. _(For detailed Supabase configuration steps, refer to the Configuring Google OAuth in Supabase or [Supabase Docs](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12129788%2Fbce031a97618e1f9-docs).)_
2. Tell the Agents Your Requirements

   - Input your requirements in the chat. For example: `"Add Google authentication"`.
   - This will add a Continue with Google button to your login page.
3. Test Google Authentication

   - Go to the login page.
   - Click the Continue with Google button.
   - Log in with a Google account and verify that the user profile is correctly updated.
   - Complete the Google OAuth flow to ensure the user is redirected back to your app.
4. Deploy Your App to Atoms's App World

### Configuring Google OAuth in Supabase

1. **Create a Google Cloud Project**

   - **Access the Google Cloud Console**

     - Open the [Google Cloud Console](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12129788%2F01dfe237e8e43e50-asset) and log in to your Google account.
   - **Create a New Project**

     - Click the dropdown menu at the top and select **New Project.**
     - Enter a project name, select a billing account, and click **Create.**
2. **Configure Google OAuth Credentials**

   - **Set Up the Consent Screen**

     - In the search bar, type OAuth and open the OAuth consent screen.
     - Fill in your app's name, user support email, and other required fields.
     - Select External or Internal, then click Create.
   - **Create an OAuth Client ID**

     - Click Create OAuth Client, then select OAuth Client ID.
     - For Application Type, choose Web application.
     - In Authorized redirect URIs, add the callback URL from the Supabase dashboard.
     - Click Create and note down the generated Client ID and Client Secret.
3. **Configure Google OAuth in Supabase**

   - **Log in to the Supabase Dashboard**

     - Open the [Supabase Dashboard](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12129788%2Ff637107128b2e484-asset) and log in to your project.
   - **Enable Google OAuth**

     - Navigate to the **Authentication** page.
     - In the **Providers** section, find the **Google** option and enable it.
     - Add the **Client ID** and **Client Secret** generated earlier to the respective fields.
   - **Save Configuration**

     - Click **Save** to apply the changes.

## Data Storage

You may also want to store user data after configuring user authentication for your web/app.

Once connected to Supabase, simply tell Atoms what data you want to save in the database. The agents will automatically configure database tables and integrate them directly into your UI.

1. Define Your Requirements

   - Enter your requirements in the chat. For example: `"Please ensure that new trip records are saved to the database"`.
   - Describe the data you want to store as clearly as possible.
   - Atoms will automatically configure the required database structure based on your input.
2. Test the Functionality in Atoms

   - Create sample data in your app, such as adding a few "trip records" through the UI.
   - Save the data and refresh the page. The data will be synced to the Supabase database.
   - Log in to Supabase and verify whether the newly added data exists in the database.
3. Validate Data Synchronization Between Atoms and Supabase

   - Open the Supabase dashboard and navigate to the Table Editor.
   - Modify existing data or create new data.
   - Changes made in Supabase will be synced in real-time to your Atoms app.
   - Return to Atoms and verify whether the modified or newly created data is displayed correctly.
   - If the data syncs successfully, then your configuration is complete.
4. Deploy Your App

## Edge Functions

Supabase Edge Functions are serverless backend programs deployed on server nodes close to your users. They eliminate the need to build and maintain traditional servers, enabling you to run any custom logic with lower network latency and faster response times. In most web applications, the frontend (buttons, forms, UI) handles basic interactions, but some critical operations must run on the backend, such as:

- Automatically sending a welcome email after user registration;
- Invoking AI APIs to analyze or score content upon form submission;
- Integrating third-party payment gateways and recording order details during checkout.

All of these operations are implemented via Edge Functions.

## Use Cases

Using Supabase Edge Functions in Atoms, you can:

- Send welcome emails: Automatically email new users a welcome message with next-step guidance after they register, boosting engagement and onboarding experience.
- Handle user form submissions: Upon feedback, sign-up, or comment submission, automatically generate and send a confirmation notification (e.g., "We've received your feedback and will review it shortly") so users know their action succeeded.
- Schedule reminders: Set daily or weekly notifications via email or push (for meetings, tasks, or events) to help users manage their time and stay productive.
- Leverage AI services: After the user enters text, automatically call AI APIs like OpenAI for grammar checking or intelligent rewriting, and return the optimized results to the user.
- Process online payments: When users initiate a payment on your e-commerce or service platform, integrate with gateways like Stripe to securely handle transactions and display clear success or failure pages with order details.

## Key Storage and Management

Many applications require keys or API credentials to connect with third-party services (e.g., Stripe, OpenAI). When Supabase is connected, Atoms provides a secure way to manage and use these secrets. Through Atoms's integration with Supabase, whenever a function needs a secret, Atoms automatically detects it and prompts you to enter the required value. You simply click the Agent's "Add API Key" button and enter your key; Atoms then encrypts and stores it in Supabase's Edge Functions Secrets Manager. At runtime, these keys are securely injected into the function, preventing credentials from being stored in plaintext.

## Add and Deploy Backend Functions

After connecting to Supabase, tell the Agent what you need:

- Type your request in the chat. For example: "Generate a webpage that calls the Gemini API to estimate food calories and returns the result when I upload a food photo."
- Once the Agent has generated the code, two buttons will appear: **Add API Key** and **View in Edge Function**.
- Click **Add API Key**.
- Enter your API key and click **Send**.
- Click **View in Edge Function**.
- You will be redirected to the Supabase Edge Function page.

  Security Note: All keys are encrypted and stored in Supabase; Atoms cannot access them.

## FAQs

<AccordionGroup>
<Accordion title="How do I add Supabase backend features to my application?">
Integrate Supabase into your application in three simple steps:

- Click the authorization button in the top-right corner of the chat interface to authorize your Supabase account.
- Select and link the Supabase project you want to use.
- Share your requirements in the chat, and the agents will develop features based on your connected Supabase project.
</Accordion>
<Accordion title="Does Supabase support social logins?">
Supabase supports various authentication methods, including:

- Email and Password.
- Passwordless Authentication: Options like one-time passwords (OTP) or magic links.
- Social Logins: Support for third-party providers such as Google, Twitter, and GitHub.
- Phone Authentication.
- Single Sign-On (SSO): Support for SAML SSO.
- Anonymous Login: Allows users to log in anonymously.
</Accordion>
<Accordion title="Do I need to create a separate Supabase project for my app?">
You can either select an existing Supabase project or create a new one. Each chat can connect to only one project at a time.
</Accordion>
<Accordion title="After connecting to Supabase, will the connection remain if I remix my project?">
The connection will disconnect after remixing and needs to be re-established. Additionally, if an app in the App World shared by other users is connected to Supabase, other users cannot remix it.
</Accordion>
<Accordion title="Can I use one Supabase database for multiple Atoms projects?">
Yes, you can use one Supabase database for multiple Atoms projects. However, you need to manage the connections and configurations carefully.
</Accordion>
<Accordion title="Why isn't my project showing up under Supabase organizations?">
On the free Supabase plan, any project with no activity for seven consecutive days is automatically paused. In the **Atoms** Organizations list, switch to the Inactive filter to view any of your projects that have been paused.
</Accordion>
<Accordion title="Why do I see "The organization has been bound by another user" when trying to connect to Supabase?">
Supabase enforces a one-to-one OAuth binding between each organization and an Atoms account. If the “Test” organization has already been authorized by another Atoms user, any subsequent attempt to bind it with a different account will be rejected with this error. 

To fix this, open the Supabase Dashboard sidebar under Settings → API → OAuth Apps, delete the existing Atoms OAuth grant for that organization, then return to Atoms and reconnect using your own account.
</Accordion>
</AccordionGroup>
