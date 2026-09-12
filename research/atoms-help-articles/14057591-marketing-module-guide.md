# Marketing Module Guide

- Source: https://help.atoms.dev/en/articles/14057591-marketing-module-guide
- Summary: The Atoms Marketing Module integrates with GA4 to track website traffic, user behavior, conversions, and SEO performance.
- Updated: Jul 12, 2026

---

## **Overview**

The Marketing module integrates with [Google Analytics 4](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F14057591%2F6ae12797509f856f-analytics) to track website traffic, user behavior, and conversion signals. GA4 consolidates data across web and mobile environments and includes predictive analytics such as purchase probability and churn risk.

Connecting GA4 allows Markting to:

-   Monitor traffic sources and user acquisition
    
-   Track user behavior across pages
    
-   Identify high-value visitors
    
-   Optimize marketing campaigns and growth strategies
    

## **Before You Start**

Ensure the following prerequisites are completed:

1.  A Google account is available.
    
2.  A GA4 property has been created in [Google Analytics 4](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F14057591%2F6ae12797509f856f-analytics). (If you haven't already, you will be guided to sign up for GA4 within the Atoms workspace first.)
    
3.  When you are signing up for GA4, do not skip the fifth step of starting data collection.
    
    ![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F14057591%2F528331740d28d7ec-data-2Bcollection-2Bstep.png)
    
4.  Your website has a domain or temporary domain. You can purchase a new domain through Atoms. For more information about the domain, see [Customize Your Domain.](https://help.atoms.dev/en/articles/13362391-connect-and-manage-domains)
    

## **Step-by-Step Guide to GA4**

**Step 1**: Publish your site first, and customize your domain if you have one.

**Step 2**: Navigate to the Marketing Module and authorize GA4.

**Step 3**: Set up the site in Google Analytics.

**Step 4**: If the agent detects that your GA4 script is not in index.html, you can click check status. Atoms' agents will automatically set it up.

![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F14057591%2Fa7988150bf024bce-Screenshot-2026-03-13-at-16_38_24.png)

**What is the GA4 script?**

-   A GA4 script is a piece of JavaScript tracking code used to integrate Google Analytics 4 into a website or app. Its purpose is to collect user behavior data and send it to GA4 for analysis.
    

-   A typical structure of the GA4 script:
    

```
<!-- Google tag (gtag.js) --> <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script> <script>   window.dataLayer = window.dataLayer || [];   function gtag(){dataLayer.push(arguments);}   gtag('js', new Date());    gtag('config', 'G-XXXXXXX'); </script>
```

-   **gtag.js**: It is officially called the **Global Site Tag**, and is the JavaScript tracking library used by **Google Analytics 4**. It is a piece of reusable code provided by Google that collects user behavior data on a website and sends it to Google’s analytics or advertising systems.
    
-   G-XXXXXXX: Measurement ID of GA4, the unique identifier for a web data stream in GA4. It tells the tracking script where to send the data collected from your website.
    

## Step-by-Step to SEO Performance and Operations

SEO performance focuses on whether SEO efforts generate business value. If you want to monitor your website's performance, simply connect it to your domain.

Common metrics include:

-   **Organic Traffic:** traffic coming from search engines
    
-   **Keyword Rankings:** positions of target keywords in search results
    
-   **CTR:** click-through rate from search results
    
-   **Impressions:** how often your pages appear in search results
    
-   **Conversions:** conversions generated from SEO traffic
    
-   **Landing Page Performance:** how individual SEO landing pages perform
    

An **SEO operations dashboard** monitors how your website performs after it has been indexed by search engines. If you want more people to discover your project, Atoms will automatically submit it to Google Search Console**.** When the automatic setup fails, you can also [connect to it manually](https://help.atoms.dev/en/articles/12752284-boosting-your-seo).

![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F14057591%2F56bc9ee0a8c33a8c-Screenshot-2026-03-13-at-19_17_26.png)

Currently, the **Atoms Marketing Module** supports monitoring the following metrics:

-   **Total Indexed Pages:** number of pages indexed by search engines.
    
-   **Clicks:** number of clicks from search results.
    
-   **Impressions:** number of times your pages appear in search results.
    
-   **CTR:** click-through rate from search results.
    
-   **Position:** average ranking position for keywords in search results.
