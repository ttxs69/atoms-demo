# Changelog

- Source: https://help.atoms.dev/en/articles/12174667-changelog
- Summary: Stay updated on the latest features and improvements.
- Updated: Aug 19, 2026

---

## **2026-07**

### 2026-07-20

This update focuses on **Remix workflow optimization, enhanced Prompt and message retrieval capabilities, and improved Settings and mobile experience**, along with a **default model upgrade**. Overall, Remix operations for public content are now smoother, Prompt history and historical message lookup are easier, project settings and link presentation are more consistent, and some users will gradually gain access to a new free first-preview experience.

#### New Features

* **Added Prompt fetching, viewing, and search capabilities:** You can now fetch Prompt data, view Prompt history, and search related Prompt content, making it easier to quickly find reusable prompts and historical content.
* **Support for searching Prompt messages in chat history:** In Chat history, you can now more conveniently retrieve messages related to Prompts, improving review and reuse efficiency.
* **Remix progress display:** After submitting a Remix, clearer process feedback will be provided, including progress pop-ups or prompts, helping you understand the current processing status.
* **Project sidebar hover preview:** When browsing projects in the sidebar, you can now quickly preview project content by hovering, helping you identify the target project faster.
* **Mobile Appearance drawer:** Appearance in the mobile user menu is now displayed as a bottom drawer, allowing direct switching between Light, Dark, and System themes without navigating to the Settings page.
* **Fullscreen display for multimodal files:** In certain scenarios, multimodal files in the editor now support fullscreen viewing, making it easier to browse larger content.
* **Gradual rollout of free first-preview experience:** Eligible users can now enjoy a free first preview in supported scenarios. This capability will be gradually enabled based on experiment groups and availability.
* **Automatic memory compression experiment groups:** Within applicable scopes, the system now supports new memory compression experiment groups to optimize the experience in long conversation scenarios.
* **Video upgrade entry for free users:** Eligible free users now have access to video-related upgrade capabilities, providing a smoother path into the corresponding upgrade flow.

#### Improvements

* **Smoother Remix workflow for public content:** When initiating a Remix from a public page, the required title, version, and configuration are now provided more directly, reducing extra waiting steps and allowing users to enter Remix faster.
* **Simplified Remix reward flow:** Remix initiation no longer depends on additional share verification steps. Eligible rewards will now be automatically determined and processed by the system, reducing workflow interruptions.
* **Easier access to Remix earnings information:** Remix-related statistics now support hover tooltips and direct navigation to Earning History in Settings, making it easier to view earnings records.
* **Optimized Prompt history APIs and experience:** The fetching and search capabilities related to Prompt history have been refined and strengthened, resulting in more stable overall results and more consistent behavior.
* **Optimized Settings navigation and default opening logic:** The Settings panel’s title, primary/secondary entry points, and default opening location have been optimized. When opening Settings within a project context, it will more naturally land on the corresponding panel, and the mobile hierarchy is now clearer.
* **More consistent project domain and URL display:** Unpublished projects now display a stable default subdomain; the URL in Project General has also been changed to show the subdomain, keeping it consistent with the editing method.
* **Clearer display of sharing and publishing links:** Link display in the share reward card has been adjusted to use the published domain, so copied links can be used directly as valid URLs and are more suitable for external sharing.
* **Latest multimodal results prioritized in the editor:** When content includes newer multimodal outputs, the system will prioritize displaying them in the editor, reducing back-and-forth switching between viewing areas.
* **Improved mobile interaction experience:** Details including Plan-related prompts, image preview zooming, and pop-up handling before payment redirects have all been optimized for a smoother overall experience.
* **Updated default model configuration:** The product’s default model has been upgraded to a new version. Users can experience generation and conversation capabilities based on the new model in supported scenarios without additional setup.
* **Optimized conversation cleanup strategy:** Background cleanup for inactive conversations has been improved, helping reduce the impact of residual historical data on the user experience and improving long-term operational stability.

#### Bug Fixes

* Fixed an issue where **logged-in users could be incorrectly identified as not logged in when initiating Remix directly from the detail page**.
* Fixed an issue where **rewards could still be triggered after a Remix failed**. Rewards are now processed only after Remix is successfully completed.
* Fixed an issue where **template-based Remix should not receive sharing rewards**, preventing inaccurate reward distribution.
* Fixed an issue where **Remix failure prompts could persist, appear repeatedly, or cause errors when clicked**. Failure prompts now better reflect the actual status.
* Fixed an issue where **invalid requests could be triggered on the Remix in-progress page, resulting in blank pages, errors, or abnormal states**.
* Fixed an issue where **in some Remix failure scenarios, the failure status could keep reappearing after refresh**.
* Fixed an issue where **message search matching was inaccurate**. Search now better ignores irrelevant spaces, improving lookup success rates.
* Fixed an issue where **task-type messages were missing option information**. Related messages now return more complete content.
* Fixed an issue where **the free first-preview configuration was not passed correctly**, preventing some eligible users from seeing the experience as expected.
* Fixed an issue where **memory compression experiment group identification was abnormal**, preventing some users from correctly entering the corresponding experiment experience.
* Fixed issues where **Prompt history drawer data did not refresh in time, jump-to highlight areas behaved abnormally, and mobile trigger areas were inaccurate**.
* Fixed an issue where **the project creation time format in Project General was inconsistent**. It is now uniformly displayed in a fixed time format.
* Fixed an issue where **project domain separation was displayed incorrectly in unpublished status**.
* Fixed an issue where **relevant prompts were still shown when Stripe was not connected**, avoiding misleading information.
* Fixed an issue where **publish-related pop-ups and session states could not be retained in certain cases**.
* Fixed **several mobile experience issues**, including inconsistent image preview zoom limits and abnormal display of some prompts.
* Fixed an issue where **the link content in the share reward card was incorrect**, preventing users from copying links that could not be directly accessed.

### 2026-07-13

This update improves **project search, long-running Chat tasks, published links, and sharing rewards.** You can now search project content and file paths directly, check Credits usage for individual Chat messages, and see clearer visitor data for public Chats. Long tasks, stop actions, published URLs, and reward confirmation should also feel easier to understand.

#### New Features

* **Project search:** You can now search text content, file names, and file paths inside a project. For projects with many files, this makes it easier to find the right file or code snippet without expanding folders one by one.
* **Unique visitor stats for public Chats:** Public Chats can now show unique visitor counts in addition to views, making it easier to understand how many people actually reached shared content.
* **Credits usage details:** The “...” menu under each message can now show Credits usage for that Chat message, helping you understand roughly how much a single task used.
* **Improved continuity for long Chats:** In multi-turn conversations or long-running tasks, Atoms now organizes context automatically to reduce missed information, misunderstanding, or task interruption caused by very long conversations.
* **Local image generation support:** For users with a compatible local image model configured, Atoms now supports text-to-image generation through a local service, including batch generation.

#### Improvements

* **Faster Chat send feedback:** After you send a message, Chat shows the received state sooner, reducing uncertainty about whether the message was sent successfully.
* **Search results that are easier to judge:** Search now considers file content, file names, and paths together, and prioritizes more relevant or recently updated results.
* **More consistent published links:** After publishing, project URLs should better match the links that can actually be opened, reducing cases where a published project opens an old link, wrong link, or waits for sync.
* **Earlier balance warnings:** When Cloud & AI Balance is not enough for deployment, Atoms warns earlier before continuing, instead of failing later in the publishing flow.
* **Clearer sharing reward confirmation:** After a Remix sharing reward is issued, the related Chat can show a reward confirmation. Single reward amounts and monthly reward limits can also be displayed more clearly, making reward rules easier to understand.
* **More reliable command execution with special characters:** In scenarios where commands need to run, content with quotes, angle brackets, and other special characters is preserved more accurately, reducing failures caused by altered commands.

#### Bug Fixes

* **Long-running Chat tasks and stopping:** Fixed cases where Chat could get stuck while thinking, stopping, or running for a long time, including inaccurate status display or continued waiting after stopping.
* **Model selection and task continuation:** Fixed cases where the selected model in Chat could be reset unexpectedly, or a task did not continue after answering a clarification question.
* **Search, files, and Preview:** Fixed cases where search results missed paths, line numbers were inaccurate, deeply nested files did not display correctly, or some files and Previews could not open properly.
* **Publishing and domains:** Fixed cases where project URLs did not sync after publishing, links could not open, or old domains and bindings remained after changes.
* **Sharing rewards and public access:** Fixed cases where sharing rewards were not credited correctly, reward records displayed inaccurately, or public Chat visitor stats were duplicated or inaccurate.
* **Image generation and page validation:** Fixed cases where image generation failed, transparent-background images were not handled correctly, or page validation scores were inaccurate.
* **Clearer results for complex tasks:** Fixed cases where complex tasks produced repeated replies, mixed output, or misleading instructions asking users to perform unnecessary manual actions.

## 2026-06

### 2026-06-15

This update makes **team collaboration, continuous Chat workflows, Overview browsing, and page validation smoother**. Pro / Max workspaces can invite more collaborators, Prompt Queue now offers a more flexible send option, and project assets and public files are easier to view, share, and manage.

#### New Features

- **More collaborators for Pro / Max workspaces:** Pro and Max workspaces now support unlimited collaborator seats, making it easier for teams to build, edit, and manage projects together. Free workspaces still keep the single-member limit.
- **Send now in Prompt Queue:** A queued message can now be sent immediately without waiting for its original order. If sending fails, the message returns to the queue to help prevent content loss.
- **Per-project Atoms Badge control:** In supported projects, you can choose whether to show the Atoms Badge. If unchanged, the project follows the account default setting.
- **Richer Overview browsing:** Video and poster examples can now show titles, descriptions, and prompts in the current language. Poster examples also include cover images, making them easier to browse and select.
- **Easier public file sharing:** Some public files can now be opened and downloaded through public links, making them easier to share from public pages or external contexts.
- **Page validation:** In supported scenarios, Atoms can check whether a generated page works as expected and show validation progress, results, and scores for buttons, forms, navigation, and core interactions.
- **Centralized media asset management:** Generated images, audio, and videos are organized more clearly in project asset folders, making them easier to find, reuse, and manage.

#### Improvements

- **Clearer workspace plan guidance:** When downgrading a plan, the page now shows the current member count and the target plan limit more clearly, making it easier to know which members need to be adjusted first.
- **More consistent collaboration permissions for new workspaces:** For eligible paid users, newly created workspaces now inherit member seats and invitation permissions more reliably from the current plan.
- **Logo and image generation for publishing:** Logo generation now supports transparent backgrounds and follows the requested theme more closely. Image generation also supports more model, format, and background options in supported scenarios.
- **More realistic page validation:** Validation now handles login, sign-up, payment, and checkout flows more appropriately. For games and highly interactive pages, it focuses more on whether core actions produce visible feedback.
- **Clearer Preview feedback:** Preview link detection is more accurate, reducing cases where the wrong page opens. When screenshots take longer or a page load times out, the feedback is clearer.
- **Faster start for simple tasks:** For clear, smaller-scope requests, Atoms reduces unnecessary planning confirmation steps so generation and edits can begin sooner.

#### Bug Fixes

- **Collaboration and plans:** Fixed issues where some Pro / Max workspaces could not invite members correctly, or downgrade guidance was unclear.
- **Remix Preview experience:** Fixed cases where some Remix projects opened the wrong page in Preview, and improved cases where project information was not carried over correctly after Remixing.
- **Continuous Chat and queue status:** Fixed cases where Prompt Queue did not continue sending as expected, and reduced misleading Chat status prompts after state changes.
- **Overview asset display:** Fixed cases where deleted assets still appeared in Overview, cover images could not open, or asset titles and types were displayed inaccurately.
- **Public files and Atoms Badge:** Fixed cases where some public files could not be opened or downloaded, and improved Atoms Badge display consistency on public and embedded pages.
- **Page validation:** Fixed validation issues such as missed clicks, screenshot failures, repeated page opens, incorrect redirects, blank pages, accidental login/sign-up form filling, and inaccurate scoring on complex pages.
- **Generation and project usage:** Fixed cases where image, audio, or video generation could fail when services were busy, as well as issues that could affect project asset handling or recovery after interrupted generation.

### 2026-06-08

This update introduces **Chat message queueing, multilingual Connector descriptions, and reward total visibility in wallet-related pages**. It also improves App Info syncing, deployment domain display, file access, media archiving, and build recovery, while fixing known issues in message queueing, file preview and download, App Viewer, multilingual display, version handling, and account state.

#### **New Features**

- **Chat message queueing:** In supported scenarios, when an Agent is still working on the current task, follow-up messages can be added to a queue and sent after the current turn finishes. This capability will roll out where available.
- **Queue management:** Queued messages can be paused, resumed, reordered, edited, deleted, or cleared, making continuous follow-up conversations easier to manage.
- **Multilingual Connector descriptions:** Connectors can now show descriptions based on the current language. When localized content is not available, the original content is shown as a fallback to avoid blank or missing information.
- **Reward total visibility:** Cloud & AI payment-related pages now show cumulative reward credit information, making reward arrivals easier to track.
- **Build task resume:** Interrupted build recovery tasks can now continue from a specified point, reducing repeated processing.

#### **Improvements**

- **App Info syncing:** Improved the syncing mechanism after App Info is saved, so titles, icons, and related information in Overview can take effect more promptly.
- **Deployment domain display and switching:** Improved deployment domain configuration and display switching, making Publish, Preview, and Live site information clearer.
- **Chat continuous conversation experience:** Improved queue timing and state checks. After the Agent finishes the current turn, the next queued message enters the sending flow more promptly, with clearer status feedback when resuming a queue or when credits are insufficient.
- **Model selection and Settings experience:** The Default Model selector in Settings > General and the model dropdown on the homepage now present common and recommended models more clearly, while keeping existing entries such as Auto. Repeated Language and Theme entries in Settings have also been organized.
- **File access and media archiving:** Improved file path recognition in the Chat root directory and related folders. Generated image, audio, video, and music files now use more consistent naming and archiving, with automatic numbering for duplicate names to avoid overwrites.
- **Storage and image result display:** Long project names in Storage are truncated with hover-to-view support, keeping tables readable. Image result filenames and cumulative image counts are also handled more consistently.
- **Build recovery experience:** Improved progress calculation, status feedback, credit handling, and resume logic for build recovery tasks, making long-running task recovery smoother.

#### **Bug Fixes**

- **Chat queue and message status:** Fixed issues where queued messages could fail to send automatically, pause or resume incorrectly, continue after the user stopped the Agent, or be sent too early or repeatedly.
- **Chat list and input state:** Fixed issues where Chat status did not correctly return to in progress after sending a new message, real-time message updates did not refresh the list promptly, or the input box did not refocus after a conversation ended.
- **File preview, download, and storage access:** Fixed preview link issues in sharing scenarios and admin mode, incorrect storage paths when browsing files from the Chat root directory, and cases where remaining files could not be downloaded after a Chat was deleted.
- **App Viewer and generation flow:** Fixed App Viewer-related issues, cases where the Editor panel did not open correctly after pure video generation, and layout issues in Popular Images.
- **Multilingual and Connectors display:** Fixed inconsistent multilingual descriptions, fallback display, and page rendering issues, reducing missing or inaccurate Connector information.
- **Versions, Publish, and domains:** Fixed missing version numbers in some version list cards, repeated errors or inconsistent states when unbinding domains, and Publish loading states appearing mixed across different sessions.
- **Settings, login, and account state:** Fixed message sending issues in tasks that require filling in Keys when all or some Keys were skipped. Also fixed Web/App mode state carrying over after switching accounts, lingering Settings tooltips, and repeated redirects after logout.
- **Mobile and interaction details:** Fixed mobile homepage input spacing, button spacing, border colors, human task component styling, and the missing Theme entry under advanced features.
- **Media generation and build recovery:** Fixed music filenames not being passed correctly, inaccurate image list ranges and cumulative image counts, and inaccurate resume, cross-stage continuation, or credit status feedback in build recovery tasks.

### 2026-06-01

This update improves the **Visual Editor editing experience, AI understanding of Atoms platform knowledge, Publish, Preview, and Generate flows,** and fixes known issues related to **collaboration status, payment callbacks, and workspace invitations.**

#### New Features

- **Visual Editor multi-select:** Visual Editor now supports multi-select, making it easier to select multiple elements while editing a page.
- **Atoms platform information support:** AI can now read Atoms FAQ, platform capability notes, and related knowledge on demand, improving answers about Atoms features, usage, and common questions.
- **Skill capability updates:** Skill-related capabilities have been updated to support AI task understanding, tool usage, and execution workflows.

#### Improvements

- **Visual Editor editing experience:** Improved the Visual Editor entry point, toolbar position, element selection, and sandbox startup feedback for a clearer editing flow.
- **Visual Editor startup speed:** Improved Visual Editor startup speed, reducing wait time when entering editing mode.
- **Component toolbar display:** Removed toolbars from some components that cannot be edited directly, reducing misleading interaction cues.
- **Design to Visual Editor entry experience:** Improved the path and interface feedback when entering Visual Editor from Design, reducing confusion during mode switching.
- **Chat labels and interface details:** Improved the removal action for pinned labels above Chat and unified some label naming for more consistent interface wording.
- **Select to Chat flow:** Select to Chat has been consolidated with the related Chat interaction, so users can select content and start a Chat through a more unified flow.
- **AI context understanding:** Improved how AI understands task environment information such as the current date, project root, platform, Shell, OS, and model, reducing irrelevant information in replies and execution flows.
- **Atoms platform knowledge organization:** Improved the structure and triggering logic for Atoms platform knowledge, helping AI better match topics such as Atoms Cloud, Remix, file upload, image upload, and LLM models.
- **Default project titles:** Updated the default project title template to reduce unnatural or overly generic titles in newly created projects.

#### Bug Fixes

- Fixed an issue where the issue resolve button and guidance were missing after a version build failed.
- Fixed loading state interference during Publish. Publish status is now correctly tied to the current Chat route, reducing confusing state displays across sessions.
- Fixed an issue where VIP users’ Live site updates could fail to take effect or occasionally return a 503 error.
- Fixed an issue where clicking Generate once could create two duplicate images, reducing repeated generation and resource waste.
- Fixed incorrect user working status displays in collaboration scenarios.
- Fixed version selection logic so the latest available version is used by default, reducing issues caused by fixed version selection.
- Fixed the display condition for the left progress bar in the thinking content area. It now appears only when multiple thinking items exist.
- Fixed an issue where the confirmation dialog in the design panel could not be closed properly.
- Fixed unclear feedback when the selection limit is exceeded.
- Fixed confusion between Atoms Cloud and Cloud & AI Wallet, helping AI distinguish product capabilities from wallet and billing concepts more clearly.
- Fixed unclear prerequisite guidance for Atoms Cloud in AI capability tasks, reducing misleading instructions.
- Fixed repeated processing of Stripe payment events and invoice paid flows, reducing duplicate processing or billing risk.
- Fixed workspace invitation expiration time parsing to improve invitation link validity checks.

## 2026-05

### 2026-05-28

This update introduces **Video Mode entry points and video editing improvements, a more immersive Project workspace, a Project dropdown menu, Project references, and a more flexible Keys fill-in flow.** It also improves **multimedia generation, message ordering, and account security.**

#### New Features

- Video Mode entry points and video editing: Video Mode and Create Video prompts are now easier to find from the homepage and creation entry points. Eligible users can enter the video generation, preview, and editing flow, with smoother zooming, clip selection, splitting, and local export in the editor.
- Project dropdown menu and immersive workspace: Project pages now include a Project dropdown menu for Go to Dashboard, Credits, Settings, Connectors, Rename project, and Details. The sidebar now collapses inside Projects for a more focused workspace, while staying expanded outside Projects for easier navigation.
- Project references: Chat references have been expanded to support combining different content types in the same message. Each message can include up to one Project reference, making it easier to provide context when Remixing, copying, or referencing an existing project.
- More flexible Keys fill-in flow: When a task requires an API Key, users can skip some Key configuration and continue the task, then return later through the Fill in API Key prompt. This reduces interruptions during the current chat flow.

#### Improvements

- Improved multimedia generation: Generation quality has been improved for scenarios such as AI SaaS and POD ecommerce. Video, music, and image capabilities have also been refined so generated results, previews, and follow-up editing flows feel more connected.
- Improved Chat reference experience: Files, Projects, AI capabilities, and Keys can now be combined more naturally. File reference names and preview names have also been aligned to make referenced content easier to recognize.
- Improved Video Mode interactions: Video Mode state management, entry points, announcements, and page layout have been refined to reduce conflicts with other generation goals and make it clearer when the current task is in a video generation context.
- Improved Keys experience: The Keys fill-in flow has been improved across skipping, later completion, Key status refresh, and button display. Form state is also less likely to be reset during submission.
- Improved password reset security: Password reset pages now better protect sensitive link information, reducing the risk of reset tokens being exposed through third-party plugins, analytics tools, or browser referrers.
- Improved Agent message ordering: Message ordering in some multi-agent collaboration scenarios has been improved, reducing cases where messages appear out of sequence.

#### Bug Fixes

- Fixed state and display issues in Project Picker, Project references, and file references.
- Fixed drag-and-drop upload hint placement and disabled-state detection issues.
- Fixed Video Mode state management, video parameter settings, video card previews, and video masonry layout issues.
- Fixed Keys fill-in issues related to skipping Keys, incorrect button display, Key count display, and form state resets during submission.
- Fixed some Agent message ordering issues, and reduced cases where internal project context files appeared in version diffs or file lists.
- Fixed sensitive link protection issues in the password reset flow.
- Fixed display and state issues in icons, warning banners, Stop button, modals, and sidebar interactions.

### 2026-05-18

This update introduces **database management, storage management, build completion sound notifications, and an upgraded \`#\` selector.** It also improves **AppWorld Discover, Publish, Team Mode, and agent response quality.**

#### New Features

- New database management interface: A new database management interface is now available in Atoms. It supports viewing PostgreSQL table structures, browsing and editing table data, and importing or exporting CSV files, making everyday database management easier.
- Storage management in Settings: Settings now includes a storage management entry. You can view storage usage by project and folder, search, sort, paginate, navigate with breadcrumbs, and batch clean up large project files.
- Build completion sound notifications: Chat now supports sound notifications when a build completes. You can choose first-build notifications, every-build notifications, or turn them off in Settings, with an option to preview the sound.
- Upgraded \`#\` selector: The \`#\` selector has been upgraded into a multi-category popup with Upload, AI, Keys, and Projects categories. It supports searching files, AI capabilities, and Keys, along with keyboard navigation and improved desktop and mobile layouts.
- URL link and Secret references: Chat now supports more flexible URL link and Secret references. Link content can be converted into usable file references, and Secrets can be added to the current project and used in chat.
- More personalized homepage experience: Homepage notices can now be updated more dynamically. Personalized greetings also use recent visits and publish history to show content that better matches each user’s context.

#### Improvements

- More stable database and storage management: Database table structures, data editing, search and filtering, CSV import and export, and error messages have been improved. Storage management loading, search, pagination, deletion, and empty states are also clearer.
- AppWorld Discover improvements: AppWorld Discover now supports language filtering, with improvements to app cards, exposure counts, filters, and mobile category browsing.
- Publish and Team Mode improvements: Domain editing, publish status, and settings areas in Publish have been refined. A Team Mode guidance card now appears after first Publish to help users continue with team collaboration.
- More concise agent responses: Agent responses and team collaboration summaries have been optimized to reduce repeated explanations and overly long replies, making responses shorter and more direct.
- Public pages and SEO improvements: Sitemap management, public page indexing rules, and some SEO tags have been optimized to reduce private, functional, or invalid pages appearing in search results.

#### Bug Fixes

- Fixed issues in database management related to dates, JSON, primary keys, empty values, pagination, filtering, import/export, and permissions.
- Fixed storage management issues, including missing deletion failure messages, search errors, pagination issues, and root project display problems.
- Fixed homepage greeting flicker, sound notification setting failures, and Team Mode guidance card state issues.
- Fixed AppWorld Discover issues related to language filtering, filter display, mobile category scrolling, and app list syncing.
- Fixed Publish issues related to domain editing display, publish status updates, and custom domain syncing.
- Fixed URL link handling and Secret reference issues related to error messages, security validation, and file cleanup.
- Fixed issues related to billing states, public pages, editors, clipboard behavior, draft recovery, and @ mention navigation.

### 2026-05-11

This update improves **App World language filtering, Chatbox uploads, multimedia deliverable cards, Publish, public page access, and the stability of several recently released features.**

#### New Features

- Language filtering in App World: App World now supports filtering public apps by app language. The app language is identified based on the app content, and Remix apps inherit the original app language, making it easier to find apps in a specific language.
- Audio and video deliverable cards: Audio and video deliverables in chat can now be displayed as cards instead of plain text links. Generated multimedia content is easier to recognize and review.
- Folder drag-and-drop upload: Chatbox now supports dragging folders directly into the upload area, making it easier to import multiple local files at once. Drag-and-drop hints and upload status feedback have also been improved.

#### Improvements

- More accurate app language detection: App language detection has been improved to reduce misclassification in short text and mixed-language content. Language filtering results in App World are now more accurate.
- Improved Chatbox input and upload experience: The maximum Chatbox height has been increased, making long-form input easier to read and edit. Drag-and-drop highlighting, upload status feedback, folder upload, and edge-case handling have also been improved.
- Improved multimedia generation and preview: Audio, video, and image generation results are now displayed and previewed more reliably. Generated files are more likely to open in preview automatically, reducing first-preview failures, incorrect download prompts, and cases where audio or video results appear only as plain links.
- Publish and Production Keys improvements: Publish modals, publish status, sharing entry points, domain hints, and Production Keys states have been improved for a more reliable post-publish management experience.
- Public pages and SEO improvements: Blog, Insights, video, and usecase pages received updates to multilingual access, sitemap behavior, and indexing rules. This reduces empty pages, redirected pages, and incorrect language pages appearing in search results.

#### Bug Fixes

- Fixed inaccurate, empty, or mixed-language results when filtering apps by language in App World.
- Fixed cases where Traditional Chinese content could be incorrectly grouped under Simplified Chinese results.
- Fixed unstable audio and video deliverable card display, including cases where video thumbnails did not appear.
- Fixed first-preview failures, media file path issues, and incorrect download prompts for generated files.
- Fixed duplicate uploads, interrupted uploads, folder drag-and-drop issues, and flickering upload hints.
- Fixed cases where files could still be dragged into chat during manual task execution, and cases where the file tree did not refresh after upload.
- Fixed Publish issues related to status updates, domain actions, paused-state hints, and Production Keys button states.
- Fixed layout issues in narrow admin views and sidebar hover states.
- Improved privacy protection on the password reset page to reduce the risk of sensitive link information being exposed through third-party pages.
- Improved Git repository sync stability to reduce failures when fetching the latest code changes.

### 2026-05-06

This update brings **mobile app generation, mobile preview, Android build support**, and improvements to **Publish, Cloud & AI Balance, chat input, public pages, and overall stability.**

#### New Features

- Mobile app generation: Atoms now supports creating mobile app projects, expanding from web apps and websites into mobile app experiences. The new flow supports mobile project generation, preview, and build preparation.
- Mobile preview and QR code access: Mobile app projects now support preview links and QR code access, making it easier to test an app on a mobile device. Loading and readiness states have also been improved during preview preparation.
- Android build support: Android builds can now be triggered for mobile app projects. Build status can be checked during the process, and the generated build package is available once ready.
- Improved Publish flow: The Publish experience has been redesigned across first-time Publish, published project view, update flow, success modal, app status switching, and Unpublish entry. It is now easier to understand whether an app is live, copy the published link, visit the live app, and manage domains.
- Cloud & AI Balance auto top-up: Cloud & AI now supports auto top-up configuration, including payment method setup and monthly limits to help avoid interruptions when Cloud & AI Balance runs low.

#### Improvements

- More stable preview experience: App preview loading, refresh, and recovery behavior has been improved to reduce long loading states, unavailable previews after idle time, and repeated waiting before preview is ready.
- Clearer domain management: The domain experience in Publish has been refined. Default subdomains are easier to reuse, custom subdomain editing provides clearer validation feedback, and multiple domains are displayed in a more organized way.
- Better mobile app creation guidance: Mobile app generation now provides clearer guidance around supported project types and templates, helping users create the right kind of mobile project with fewer confusing steps.
- Improved chat input and file preview: Drag-and-drop file upload is easier to use with a larger available drop area. Text file previews have also been adjusted so file content is easier to read inside chat.
- Homepage and public page updates: Mobile performance on the Atoms homepage has been improved. Homepage content was refreshed with updates related to Ads Specialist. Public app pages, Discover pages, template pages, and comparison pages were also optimized for clearer presentation and better search visibility.
- SEO Agent and multilingual content support: SEO-related workflows now have additional support for translated content, helping multilingual public content stay more consistent across supported languages.
- Improved Theme and UI controls: Theme selection and shared UI components such as Select and Dropdown received visual refinements for a cleaner, more consistent interface.
- Google profile avatar support: New users who sign in with Google can now have their Google profile avatar filled in automatically. Manually changed avatars remain unchanged.

#### Bug Fixes

- Fixed issues where mobile app projects were not always recognized correctly during early creation.
- Fixed mobile preview issues, including unstable preview links, expired preview sessions, long loading states, and blank preview screens.
- Fixed Android build issues related to build status updates, build recovery, and build package download behavior.
- Fixed preview access issues that could cause blocked access pages, repeated redirects, or unclear error states.
- Fixed Publish flow issues, including modal closing behavior, published state updates, success page navigation, and production key display.
- Fixed UI issues affecting the chat input area, upgrade modal behavior, payment method display, auto top-up defaults, image previews, and text file previews.
- Improved password reset link protection to reduce the risk of sensitive link information being exposed through third-party pages.
- Fixed display issues on public pages, resource lists, and SEO-related pages.

## 2026-04

### 2026-04-30

**New Features**

- Added readable AI-generated URL slugs for public pages, improving link clarity and shareability.
- Added public tag display for shared chats, making published content easier to understand and browse.
- Added translation support for AI SEO content, improving multilingual content workflows.
- Added dark mode preview thumbnails for themes, so previews better match the selected appearance.
- Added profile image syncing during Google sign-in, making account setup smoother.
- Added language fallback for video content, so English results can be shown when the selected language is unavailable.
- Added protected preview access, including dedicated authentication flows for secure preview pages integrated with the app viewer.
- Added preview access blocking screens with clearer reasons and multilingual guidance when access is restricted.
- Added "AI Code Review" to support development and quality-check workflows.
- Added "Cloud AI" auto-recharge support with related configuration options.
- Added updated homepage content, visuals, and a new "Ads Specialist" card.
- Added public SEO-friendly AppWorld routes for "Discover", "Templates", and app detail pages.
- Added scheduled "GitHub Stars" refreshes so displayed counts stay more current.

**Bug Fixes**

- Fixed an issue where users could still receive updates after stopping generation.
- Fixed cases where failed builds could leave the interface stuck in a "building" state.
- Fixed public chat tag, visit log, and user lookup display issues.
- Fixed Google Ads keyword validation compatibility issues.
- Fixed text display in JSON responses to improve readability.
- Fixed template configuration handling so non-standard settings are less likely to interrupt normal use.
- Fixed preview and publishing flows so certain preview wake-up and publishing scenarios on the Pro plan can continue even after usage credits are depleted.
- Fixed App Viewer preview state handling to reduce failed previews and inconsistent preview status.
- Fixed preview tabs that did not consistently follow the authentication flow.
- Fixed preview authentication routing and legacy route compatibility to improve protected preview success rates.

**Improvements**

- Improved proxy and route forwarding compatibility for supported scenarios.
- Improved AI SEO retry behavior and compatibility with older data.
- Improved presentation cover screenshot selection and configuration loading for more reliable cover generation.
- Improved AppWorld Discover browsing experience for finding recent public content.
- Improved the protected preview access flow, making secure preview links more reliable across different environments.

**Other Updates**

- Added configuration validation for JSON and YAML to reduce setup errors.
- Updated underlying database support for new fields and related features.

### 2026-04-20

**New Features**

- Agent collaboration

  - Added support for delegating focused development tasks to specialized sub-agents, helping break down complex work into smaller, easier-to-manage steps.
  - Introduced a clearer development workflow for agent-assisted projects: plan the work, delegate tasks, implement changes, and validate results.
  - Expanded sub-agent capabilities for incremental Supabase-backed development, making it easier to build and iterate on connected applications.
- Metrics, logging, and observability

  - Added reporting for command failures and agent-level activity metrics.
  - Expanded system logs across key workflows to make troubleshooting, monitoring, and issue diagnosis easier.
- Workspace and development tools

  - Added a workspace app launcher, making it easier to start, preview, debug, and inspect applications directly from the workspace.
  - Added automated database migration support in CI workflows, helping apply required schema updates before deployment.
- Long-form content and document handling

  - Added segmented reading for long editor content, improving reliability when working with large files or extended context.
  - Added more accurate PDF page-range reading and parsing, enabling better page-specific document workflows.
- Storage resource management

  - Added improved handling for resource files, including smarter display, access, and download behavior.
  - Introduced a new storage resource management approach for more flexible configuration and administration.

**Improvements**

- Frontend and product experience

  - Improved blog detail pages with better SEO, structured metadata, and author information display.
  - Enhanced image and file referencing within chat.
  - Improved the "What's New" panel with smarter tab display behavior.
  - Upgraded editor file-tree interactions for a smoother navigation experience.
- AI skills and multimodal workflows

  - Synced the latest agent tooling capabilities, including updated AI skills and stronger multimodal support.
  - Improved nested skill-document loading.

### 2026-04-13

**New Features**

- Added an in-app notification center: users can now view release updates, check unread indicators, open detail modals, and mark all as read directly from the Header, with read state synced across devices.
- Revamped the AI Capability Library: browsing and search experience is now significantly improved.
- Added image preview and document analysis capabilities to the editor: users can now view and interpret files directly during content creation and processing.
- Enhanced interactions for the AppWorld sidebar and project cards, delivering a smoother experience when browsing, switching, and managing projects.

**Bug Fixes**

- Fixed wallet refund status display: refund information now renders more accurately.
- Fixed multiple notification issues, including unread badge behavior, CTA dismiss logic, missing fields, and panel styling/positioning: message display is now more stable.
- Fixed an issue where notification data could be stale each time the notification panel was opened: content now refreshes as expected.
- Fixed incorrect changelog URLs.
- Fixed a routing issue with shared links: public shares now correctly redirect to the shared page.
- Fixed cover image and layout issues in the share modal affecting DR display and Free Plan users.
- Fixed a bug where the Overview status dropdown failed to appear after the initial publish.
- Resolved an issue where the "unpublished" status was not synchronizing properly across publish views.
- Fixed a glitch where the page title would incorrectly persist as the app name after returning to the homepage from the app page.
- Resolved an issue preventing horizontal scrolling for tables in the chat interface, improving readability for wide tables.
- Fixed an iframe authentication passthrough issue in the mobile AppViewer, ensuring stable access to related pages.
- Fixed a display issue with the help icon in the mobile Remix modal.
- Fixed an issue where the prompt warning monthly users about non-rolling credits upon downgrading was not prominent enough.
- Fixed a layout overflow issue with onboarding experience in the Spanish locale.
- Fixed an unresponsive click handling issue on the database sync button.
- Fixed an issue where the homepage still displayed examples under certain DR modes.
- Fixed an issue where the logout status was not synchronized across other Atoms pages within the same browser.
- Resolved an authentication recovery issue, significantly reducing the occurrence of abnormal login states.
- Fixed various stability issues related to the editor, settings toggling, app launching, and analytics tracking.

**Improvements**

- Optimized the AppWorld sidebar structure, animations, and collapsing logic to support smarter auto-collapsing on desktop and better mobile adaptation.
- Improved sidebar analytics tracking, tag interactions, list responsiveness, and project cover displays for a more intuitive browsing experience.
- Implemented state persistence for the sidebar in non-chat scenarios, retaining the user's preferred collapsed/expanded state upon returning to the page.
- Standardized the width and visibility settings of the share modal, streamlining the sharing workflow.
- Enhanced the display logic for sharing and project cover adaptations, improving visual consistency between shared pages and project cards.
- Optimized notification center panel positioning to anchor directly to its trigger button, and added unread state to Hero cards for a more unified interaction pattern.
- Improved notification center styling on mobile and in empty states: reading and interacting with notifications now feels more intuitive.
- Added a skeleton loading screen to the chat list: loading feedback is now more visible and informative.
- Added a Remix loading state indicator after forking: the processing status is now more clearly communicated to users.

**Other Updates**

- Updated documentation and configuration references for in-app notifications.
- Updated Test ID injection and CI pipeline configuration to support more stable automated testing.

### 2026-04-02

**New Features**

- Introduced template path validation for Atoms Cloud: warnings are now logged when a template path is missing, enabling faster diagnosis of configuration issues.
- Added a clear command to the template Redis management script for easier cleanup of template-related cache data.
- Introduced the `sentry_filtered_engineio_invalid_session_total` metric to track and monitor filtered invalid session errors.

**Improvements & Fixes**

- Fixed root path handling in the Atoms thinking template, improving template loading stability.
- Addressed "Too many requests" errors under high concurrency, enhancing request handling stability.
- Fixed an issue in the frontend notification flow after the version release.

## 2026-03

### 2026-03-31

**New Feature-Ads Agent**

- **Launched Ads Agent：**

  - **Automated Execution:** Instant activation with dynamic daily budget management.
  - **AI-Powered Creative:** Context-aware copywriting and keyword generation optimized for Google Ads.
  - **Tailored Bidding:** Custom strategies for Awareness, Traffic, Leads, and Sales.
  - **Full-Funnel Analytics:** Real-time tracking of CTR, CVR, ROAS, and core performance metrics.
  - **Deep Audience Insights:** Granular analysis of demographics, devices, geography, and search intent.
  - **Actionable Growth:** Data-driven strategic insights and executable optimization advice.
  - **Global Reach:** Native-level multi-language support and localized ad copy generation.

### 2026-03-30

**New Features:**

- Expanded AI capabilities with support for video, audio, text-to-speech, and speech-to-text workflows.
- Added PDF analysis tools, plus new Markdown-to-PDF conversion and chart rendering capabilities.
- Improved chat theme switching by notifying the frontend of the current theme in real time via WebSocket.
- Added locale-aware support for video documents and tags, enabling language-specific filtering and localized tag names.

**Improvements & Fixes:**

- Fixed an issue where certain configuration/version lookup failures could leave chat tasks stuck and block future messages in the same chat.
- Fixed GitHub remote-only branch switching issues to improve branch handling reliability.
- Improved image validation for local SVG and raster images, with better error handling and logging.

### 2026-03-23

**New Features:**

- **Theme**: Customizable themes and templates for personalized interface styling.

  ![](https://helpcenter-backend.deepwisdom.ai/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12174667%2Fa5dcb5bd47b8df43-Screenshot-2026-04-02-at-21_27_32.png)
- **Video i18n Support:** Video content now supports multiple languages.

**Improvements & Fixes:**

- **Cloud & AI Pricing Plan - Phase 2:** Enhanced pricing plans with more flexible options.
- **Global Tooltips Style Update:** Unified tooltip component styles for consistent interactions.
- **Affiliate Program Update:** Affiliate commission rate adjusted to 10%. All affiliate-related copy updated across the platform.

### 2026-03-16

**New Features**

- Added voice input support, including speech-to-text in message inputs on the home and chat pages.
- Expanded language support with **Traditional Chinese (zh-TW)** and **Swedish (sv)** across frontend and backend.
- Added homepage CTA experiments with multilingual template suggestions that can be inserted directly into the prompt box.
- Added an **Audience & Analytics** section entry with navigation into the Growth experience.
- Added an expandable/collapsible **Atoms Cloud** sidebar for backend projects.
- Added route navigation dropdown support in App Viewer so users can quickly switch between available app routes.
- Added backend support for **Gemini text-to-image**, and set `gemini-2.5-flash-image` as the default image generation model.
- Added **GPT-5.4** model support and related localized labels.

**Improvements & Fixes**

- Improved multilingual CTA content with updated translations for English, Spanish, Turkish, and additional supported languages.
- Improved Growth setup UX for GA4 and GSC with clearer guidance, privacy messaging, publish hints, blocked-popup fallback flows, and better no-data messaging.
- Improved domain cards to show dynamic status labels such as **Live** and **Paused**.

## 2026-02

**New Features**

- Added a new **Magic Link sign-up flow** with email verification, including email check, send, verify, and resend capabilities for smoother registration.
- Launched the new **Overview panel** after publish, with improved post-publish navigation and state handling.
- Added **version restore and preview controls** directly in the message/version list for faster iteration workflows.
- Added **image attachment support in chat**, allowing uploaded images to be passed through the chat flow more reliably.
- Introduced **Cloud & AI Wallet / Balance** pages and top-up flows, including transaction history, usage breakdown, and balance display across desktop and mobile.
- Added **Growth block capabilities** with deeper **GA4** and **Google Search Console (GSC)** integration, including property/site connection, verification, reporting, and onboarding flows.
- Added **Claude 4.6 models** and updated the default recommended/default model configuration.

**Improvements & Fixes**

- Improved **chat input responsiveness and first-screen performance** with lazy loading, deferred heavy modules, and optimizations around hydration and editor initialization.
- Improved **wallet UI layout** across desktop and mobile, including clearer balances, upgraded tooltip content, better spacing, and more polished tables/cards.
- Improved **Growth block user feedback**, prompts, and authorization states to make GA4/GSC setup easier to understand.
- Improved support for **custom domains** by prioritizing preferred/custom domains in more scenarios.

## 2026-01

**New Features**

- Added version restore for projects, including restore actions, restore progress states, completion messaging, and rollback protection for failed restores.
- Added preview version switching so you can switch preview environments between versions more directly.
- Introduced **wallet payment support**, including balance, usage, recharge order access, and instant payment creation.
- Added custom domain management enhancements, including domain purchase/connect flows, batch unbind, improved primary domain handling, and better custom-domain support across publish flows.
- Added support for **10 new languages** across backend and frontend: Arabic, Dutch, French, German, Indonesian, Italian, Brazilian Portuguese, Russian, Turkish, and Vietnamese.
- Added a new **user profile page** in the frontend.
- Added mobile file preview improvements for chat blocks, DR content, and action editor workflows.
- Added homepage, workspace, and landing page upgrades, including new homepage modules, responsive layouts, and improved content presentation.
- Added analytics events for key user actions, including version creation/failure, app viewer readiness, agent mentions, secret flows, and more.
- Added version rating feedback in chat, including thumbs up/down and structured feedback options.
- Added SEO Specialist Sarah and expanded SEO-related project support.

**Improvements & Fixes**

- Improved **version restore reliability** with locking, stronger validation, better error messages, safer rollback behavior, and long-running operation handling.
- Improved **chat performance** by reducing redundant backend refreshes, caching tab content, and optimizing message scroll/positioning behavior.
- Improved **first-screen and bundle performance** with more lazy loading, better chunking, deferred initialization, and LCP-focused optimizations.
- Improved **i18n refresh strategy** on both frontend and backend to reduce backend pressure and avoid synchronized refresh spikes.
- Improved **workspace and editor experience** by simplifying component structure and making file/task interactions more consistent.

## 2025-11 & 2025-12

**New Features**

- Introduced custom domain support for apps, including domain binding, DNS/SSL checks, primary domain management, subdomain support, and related user tooling.
- Added backend integrations for app configuration and secrets management, including improved environment variable syncing for deployed apps.
- Added Stripe connection guidance and improved Stripe/Supabase integration flows for app setup.
- Added AI capability features in the frontend, including model library, usage overview, model tags in plans/tasks, and richer model metadata.
- Introduced auto model-selection experiments and expanded model options, including new Gemini, DeepSeek, GLM, and image-capable model entries.
- Added a MetaGPT landing page and a new Atoms landing/branding experience.
- Added support for larger Max plan storage, with Max plan capacity increased from **40 GB to 100 GB**.
- Added support for bucket limits in App Storage, including a maximum of 10 buckets per user.

**Improvements & Fixes**

- Improved security around uploads, route handling, and rendered content, including stronger filename sanitization and safer HTML handling.
- Improved storage and quota handling across plans, including clearer quota enforcement and larger Max-tier allocations.
- Improved AI model presentation and organization with richer labels, descriptions, icons, and categorization across languages.
- Improved landing page, pricing, and header/footer experiences.

### 2025-11-13

**New Features**

- **Human-in-the-Loop**

  Human-in-the-Loop is a new review step that ensures Atoms Agents fully understand your intent. It presents a clear to-do list you can edit by typing **#**. After you approve it, the agents execute the plan with greater accuracy.

  ![](https://helpcenter-backend.deepwisdom.ai/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12174667%2Ffa39dbc6f2e58d61-E6-88-AA-E5-B1-8F2025-11-14-10_28_46.png)
- **Power Up with Deepseek 3.2 Exp**

  The **DeepSeek 3.2 Exp** model is now available. Enjoy faster reasoning, stronger execution, and improved reliability across your projects.
- **New Edit Mode in the Editor**

  A dedicated **Edit Mode** is now available in the Editor, giving you finer control and a smoother experience when refining content.
- **Prototype Shortcut**

  Prototype is now accessible directly from the main page for faster iteration.
- **AI Feedback Assistant & Help Center Link**

  Using the **Feedback** button (as shown in the picture below) on any message now opens a guided assistant to help you resolve issues. Additionally, a direct link to the **Help Center** is now available in your profile menu and **Settings**.

  ![](https://helpcenter-backend.deepwisdom.ai/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12174667%2F95cdfa107db32a35-E6-88-AA-E5-B1-8F2025-11-14-10_45_31.png)

**Improvements & Fixes**

- **Enhanced Slides:** Improved visual quality and layout for all generated slides.
- **Faster Page Rendering:** Wiki and Video pages now load noticeably faster.
- **Quick Sharing:** Deep Research articles now auto-generate clearer, more descriptive share titles.
- **Platform Stability:** Resolved multiple known issues to deliver a smoother, more reliable experience.

### 2025-11-05

**New Features**

- **AI Image Generation (Nano Banana Model)**

  Added support for automatic, context-aware image generation. The **Nano Banana model** enables Alex (The Engineer Agent) to produce consistent, high-quality visuals that match website content and design style.
- **Introducing How-to Guides (Creator Playbook)**

  The new How-to Guides page provides step-by-step tutorials on building various projects with Atoms, such as high-converting SaaS landing pages, calendar & scheduling projects, and an English learning platform.

**Improvements & Fixes**

- **Better Downloads:** Resolved garbled text in Deep Report downloads and enhanced overall download reliability.
- **Clearer Credit Usage:** Redesigned the free credit usage bar for better clarity, so you can easily track your monthly credits.
- **Smoother UI/UX:** Improved key interactions, including Deep Research report downloads, in-chat message sending, and block display logic.
- **Platform Stability:** Fixed multiple known bugs to enhance overall performance and reliability.

## 2025-10

### 2025-10-22

**New Features**

- **Introducing the Video Center**

  In Video Center, users can find official tutorials, in-depth guides, and practical case studies. It helps you learn more about Atoms' powerful features and quickly start building.
- **Discover the App World Showcase**

  We have added a Showcase tab in App World. It helps users to explore the potential of Atoms with a selected group of high-quality projects.
- **Enhanced Account Security**

  We've strengthened our password requirements to include special characters.
- **Instant Connection Alerts**

  If the Supabase connection is disabled, you'll now receive a clear, instant notification during a chat.

**Optimization & Fixes**

- **Smoother UI/UX**: Enhanced expand and collapse behavior for the "Task for human" input box. Updated visual indicators for files that can't be previewed.
- **Improved Security Logic**: Added clearer expiration details and retry limits to email verification and password reset links to prevent misuse.
- **Clearer Billing**: Clarified billing and deduction logic for users upgrading from an annual plan to a higher-tier monthly plan.
- **Platform Stability**: Updated backend logic for the Affiliate Program and fixed multiple bugs to improve overall platform performance.

### 2025-10-01

**New Features**

- **Annual Subscription Plan**

  We've introduced an **annual subscription option** to provide users with greater cost efficiency for long-term projects. When purchasing the **first-tier credits** in the Pro or Max plan, you'll receive a **21% discount**. For all other tiers, the discount rate is **18%**.

  For details about pricing, billing, and credit allocation, refer to the Atoms [Annual Payment Plan](https://help.atoms.dev/en/articles/12457281-atoms-annual-payment-plan).

  ![](https://helpcenter-backend.deepwisdom.ai/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12174667%2F8f3934c6328f4096-E6-88-AA-E5-B1-8F2025-10-09-2B15_06_38.png)
- **Brand New Use Cases Page**

  We've redesigned our use cases page to better communicate our mission of **_bringing ideas to life with AI Agents_**. The new layout delivers a cleaner look, clearer messaging, and a more intuitive start for new users.
- **Language Switching**

  We've added four official languages, including:

  - **简体中文 (Simplified Chinese)**
  - **日本語 (Japanese)**
  - **한국어 (Korean)**
  - **Español (Spanish)**

  Users can switch languages from the top-right menu.
- **Replay**

  **Replay in App World** — You can now watch the full step-by-step creation process of any app directly in **App World**. The new Replay feature reveals how complex projects are built from a single prompt.

**New Community & Partnership Programs**

- **Explorer Program Launched**

  Join the **Atoms Explorer Program** to gain early access to major beta versions, verified identity status, monthly rewards, and official exposure opportunities. Explorers can contribute by engaging with the community, sharing feedback, and promoting Atoms across platforms. Apply now to shape the future of AI collaboration.
- **Affiliate Program Launched**

  You can now earn commissions by referring new users to Atoms**:** 30% commission on each referred user's first six payments + 10 credits for your friend.

  For more details, see [Affiliate Terms of Service](https://help.atoms.dev/en/articles/12128527-affiliate-terms-of-service).

**Optimizations & Fixes**

- **Default Engineer Mode**

  Workspaces now default to Engineer Mode for a more powerful initial experience.
- **UI/UX Improvements**

  Enhanced wording for Supabase connection prompts and improved visual effects for slides.
- **Bug Fixes**

  Resolved multiple known issues, significantly improving platform stability and performance.

## 2025-09

### 2025-09-08

**New Features**

- Fully refreshed product design.
- Simplified pricing plans: Free, Pro, and Max. Pro and Max can be paired with different credit tiers.
- Launched a new AI agent, Iris, the Deep Researcher, supporting in-depth research scenarios.
- Introduced BON (Race Mode).
- Added semantic Actions.
- Rebuilt the PPT creation flow with improved prompts and outputs.
- Released new models: GPT-5, Gemini 2.5 Pro, Qwen3, and DeepSeek 3.1.
- Updated sidebar layout and added "star" for chat lists.
- Publish settings are now integrated with Domain in the Settings panel.
- Added support for connecting Supabase projects directly from the homepage.
- Paid users can now set default chat permissions (e.g., default private) in **Settings**.

**Fixes and Improvements**

- Improved Remix display format.
- Optimized model list presentation.
- Enhanced quick-access interactions.
- Fixed several known bugs.

## 2025-06

### 2025-06-18

**New Features**

- Instant Answers, Zero Wait: For simple Q&A, get replies instantly without the agent environment spin-up.
- Introducing Engineer & Team Modes: A game-changer for your workflow and credits! Use Engineer Mode (just Alex the Engineer) for focused dev tasks to boost speed and save costs.
- Supercharged Sharing: New chats are public to the App World by default, plus one-click social sharing and a new Export function for your files.
- Supabase Edge Functions: Pro users can now write custom logic, handle webhooks, and more.
- Smarter Help Center with AI: Our revamped Help Center now has AI-powered Q&A.
- Automatic Terminal Error Detection: Spots and helps fix tricky errors for you
- Customize Your Profile: You can now change your avatar and username.
- Model Update: We've officially sunsetted the claude-sonnet-3.5 model and updated the claude-4-sonnet model.

**Fixes & Improvements**

- Blazing-Fast Dev Experience: We've slashed the time from prompt to live preview and made deployment more flexible.
- Cleaner, Smarter UI: The interface is now more streamlined and transparent during agent thinking.
- Rock-Solid Stability: We’ve fixed multiple bugs for a more stable and reliable experience.

## 2025-05

### 2025-05-09

**New Features**

- Enhanced Human Task Interaction: The input box now serves as the central hub for all tasks. Each step keeps a single focus point for a clearer workflow. All task entry points are consolidated in the input box for better usability. Agent task types are dynamically analyzed to optimize interactions.
- Mobile Support:Complete end-to-end experience on mobile browsers (register → login → chat → deploy → share).
- Promotional Plan Redemption: Redeem special plan packages using codes from official Atoms events.
- Conversation Improvements: Added "scroll to latest" shortcut for better message navigation.
- Slidev (Presentation) Enhancement: PDF export support for presentations.

**Fixes & Optimizations**

- Storage Management: Improved interaction when agent storage is full, with quick access to cleanup options.
- UI Enhancements: Added Exchange explanation on Plan page showing credit conversion formulas; Toggle option for preview/deployed page corner icons.
- Bug Fixes: Resolved various known issues for improved stability.

## 2025-04

### 2025-04-03

**New Features**

- Email Notifications: Subscription cancellation alerts; 70% credit usage warnings with usage optimization tips; 3-day expiration reminders with remaining credit info.
- One-Click Google Auth: PC users with Google accounts can now authorize with a single click.
- Storage Optimization: System now supports more users with improved efficiency.
- App World Enhancements: New category tags for quick App filtering; Template gallery with curated examples you can remix; Create new apps directly from these templates.
- Enhanced Security: Improved chat share links with access tokens to prevent unauthorized access.

**Fixes & Optimizations**

- UI Improvements

  - Better Credit Saving Tip interaction.
  - Improved Team Service initialization.
  - Updated LLM-related error messages.
  - Links now open in new tabs instead of replacing Atoms.
  - Copy support for Terminal/Planner/Notebook/Editor blocks.
  - Fixed camera access in App Viewer.
  - Complete model display below the conversation box.
  - Overall icon UI improvements.
  - Fixed Mac cover upload UI issue.
- Terminal Enhancements: Extended no-output timeout to 5 minutes for large dependency downloads.
- Bug Fixes

  - Fixed 8192 token limit errors.
  - Improved App card keyboard navigation.
  - Streamlined preview link pages.
  - Fixed Deploy/ReDeploy button text.
  - Fixed text selection behavior with @mentions.
  - Enhanced link sharing with visible titles/descriptions.
  - Fixed Task for Human timeout issues.
  - Fixed conversation freeze when renaming active chats.
  - Fixed bug report button display.
  - Fixed display of conversations with 1,000+ messages.
  - Added auto-redirect to login after inactivity.

## 2025-03

### 2025-03-20

**New Features & Improvements**

- Free Remix: Updated remix logic - remixing is now completely free!
- Streamlined Payment Flow: Payment method selection now comes before the Stripe payment page.
- App World Enhancements: Added like/upvote functionality; Added credit cost display on App cards; Updated default placeholder images for shared Apps.
- UI Improvements: Updated names for some homepage shortcut cases; Improved mobile responsiveness for the homepage; Updated prompts for conversations exceeding 5 rounds.
- Navigation Improvements: Added 404 redirects to the homepage for non-existent URLs; Added webpage titles for chat, share, and App World pages (searchable in the address bar).

**Bug Fixes & Optimizations**

- Fixed various Remix bugs.
- Improved App image loading speed in App World.
- Fixed business card bug in quick access shortcuts.
- Optimized web dependency management logic - develop more projects within the existing storage.
- Fixed editor bug where file name changes and deletions failed to reset state
- Improved shared version handling - redirects to pinned or latest version when specified version doesn't exist.
- Optimized runtime update handling - chat messages now directly update the runtime state.
- Improved loading speed for homepage and chat pages.
- Fixed queue display error.
- Fixed editor diff bug.

### 2025-03-08

**Feature Improvements**

- Improved homepage layout and chat bottom shortcuts.
- Increased message limit for Free Plan users from 3 to 5 messages per chat.
- Added "Continue" or "Remix" options after conversation interruptions.
- Added countdown timer for the "Ask Human" feature.
- Repositioned Remix button for better visibility.
- Enhanced "Ask Human" functionality - automatically clicks **Reply** and pre-quotes the agent's message in the input field.
- Enhanced source chat navigation after remix - your own chats open in editable mode, and others' chats open in read-only mode.
- Simplified Share functionality for better user experience.
- Added guidance on the subscription page: read App World and Help Center for Atoms usage tips.

**Bug Fixes & Optimizations**

- Fixed memory issues with Remix.
- Improved chat recovery logic and payment-related functions.
- Fixed David's terminal run functionality.
- Resolved template code reading errors.
- Optimized page handling for excessive versions.
- Fixed version screenshot font issues.
- Fixed 404 content display when sharing non-existent files.
- Enhanced Remix memory processing.
- Improved payment pages and logic.
- Fixed occasional token limit issues.
- Made the Deploy button more prominent.

### 2025-03-02

- System Expansion: Enhanced server capacity and concurrency for more reliable user experience.
- Complex Requirements Strategy: Introduced a new feasibility assessment logic for new projects, helping users gauge the viability of proposed ideas.
- Token Optimization: After further testing in multiple incremental development scenarios, we have achieved an average reduction of approximately 56% in token consumption.
- Bug Fixes & Optimizations:

  - Improved certain text descriptions to be clearer and more understandable.
  - Fixed various bugs related to Remix.
  - Optimized Claude 3.7's performance on Atoms.
  - Resolved blank preview issues when viewing Word documents in the editor.
  - Enhanced page display and interaction for a smoother user experience.
  - Fixed a specific issue with agent memory restoration in certain scenarios.

Thanks for your continued support! If you have any questions or feedback, feel free to reach out to us.
