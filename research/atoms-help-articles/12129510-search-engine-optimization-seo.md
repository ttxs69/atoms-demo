# Search Engine Optimization (SEO)

- Source: https://help.atoms.dev/en/articles/12129510-search-engine-optimization-seo
- Summary: Merged SEO guide covering Sarah AI specialist, Google Search Console, HTML tag verification, sitemap.xml, and URL inspection
- Updated: Jul 29, 2026

---

Search Engine Optimization (SEO) is the process of improving your website so search engines like Google and Bing can understand, index, and display your pages in search results. Optimizing your content increases organic, high-quality traffic without paying for ads.

## Meet Sarah, SEO Specialist at Atoms

Sarah is your AI teammate dedicated to SEO optimization. She helps you generate structured content, optimize meta tags, build sitemaps, and prepare your site for search engine indexing.

### How Sarah Helps You Get Indexed

Google prioritizes clear, relevant, and well-structured content. By generating detailed articles that cover your topic in depth, Sarah significantly increases the likelihood that search engines will discover and index your site.

### 2 Ways to Activate Sarah

You can trigger Sarah directly within your chat or prompt using either of these methods:

1. **The Direct Tag (@Sarah)**: Tag `@Sarah` in your prompt or request.  
   *Example*: `@Sarah, please analyze my landing page and optimize all meta tags and SEO descriptions.`
2. **The Keyword Method (SEO)**: Explicitly mention `SEO` (Search Engine Optimization) in your prompt. Sarah recognizes this keyword and automatically queues an SEO scan once the build completes.

*Note: Sarah is exclusively available in **Team Mode**. Be sure to toggle Team Mode on during project setup or switch to Team Mode in the chat box before requesting Sarah.*

---

## Boosting Your SEO & Submitting to Google

Once your project is published and fully functional, follow these steps to boost your SEO and ensure your site gets indexed by Google quickly.

### Step 1: Tell Your Agents Your Domain & Sitemap Needs

Prompt your AI agent team with your published URL:
- *"Here is my domain: [Your Published URL]. Help me boost my SEO and generate a sitemap.xml so my website can be indexed by Google."*

Your agents will generate the required meta tags, canonical URLs, and `sitemap.xml` file automatically.

### Step 2: Verify Site Ownership in Google Search Console

To accelerate indexing, register your site in Google Search Console:

1. **Add Property**: Select **URL prefix** on the right side and paste your domain URL.
2. **Choose Verification Method**: Select the **HTML Tag** verification method.
3. **Add HTML Tag via Agents**: Copy the `<meta>` tag provided by Search Console and prompt your agents:  
   - *"Help me add this HTML meta tag into the `<head>` section of my homepage: [Paste HTML Tag Code]"*
4. **Verify**: Wait 5–10 minutes after the agents deploy the tag, then return to Google Search Console and click **Verify**.

### Step 3: Submit Your Sitemap.xml

1. Download the generated `sitemap.xml` file from Atoms or obtain its URL path.
2. Go to **Sitemaps** in Google Search Console.
3. Type `sitemap.xml` under **Add a new sitemap** and click **Submit**.

---

## Manual URL Inspection for Immediate Indexing

While Google discovers pages automatically over time, you can speed up indexing for new articles using the **URL Inspection Tool**:

1. Open **Google Search Console**.
2. Paste the exact URL of your new page into the search bar at the top and press **Enter**.
3. If Google states *"URL is not on Google"*, click **Request Indexing**.

This places your URL into Google's priority crawl queue, typically appearing in search results within a few hours to a day.
