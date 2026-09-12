# GitHub Connect

- Source: https://help.atoms.dev/en/articles/13222322-github-connect
- Summary: Connect your Atoms project with GitHub.
- Updated: Jul 12, 2026

---

## **What is GitHub?**

GitHub is an online platform for storing, managing, and collaboratively developing code, and it is also the world’s largest open-source community. You can upload your projects to GitHub to clearly track when changes were made to your code and why. GitHub allows multiple people to work on the same project at the same time, review each other’s changes, propose suggestions, and have discussions.

Overall, the experience is similar to a multi-user online document with full version history. For this reason, GitHub has become an almost indispensable piece of infrastructure in modern software development.

At its core, GitHub excels at version control. It is built on Git, a version control system that continuously records the evolution of a project. Whether you are developing independently or collaborating with others in parallel, this capability significantly reduces the cost of trial and error and makes collaboration on complex projects more controllable and transparent.

GitHub also provides stable and reliable code hosting. Each project is stored in a repository that contains all source code and related files in one place. Repositories can be public, allowing anyone to browse and learn from them, or private, accessible only to specific members, meeting different privacy and security needs across project stages and types. With cloud-based hosting, code is no longer tied to a single computer, but becomes a long-term, always-accessible digital asset.

From a collaboration perspective, GitHub makes team development structured and efficient. Discussions, bug tracking, and feature planning can all happen directly around the code itself. These conversations and decisions are preserved as part of the project’s history. This “code-centric collaboration” model is a key reason many teams choose GitHub.

In addition, GitHub is a highly active community. A vast number of high-quality open-source projects continuously evolve on the platform. Anyone can read their code, learn from their implementations, or even contribute directly. Through starring, following, and forking projects, developers form strong connections with one another. As a result, GitHub is not just a tool, but an ecosystem that continuously drives software innovation.

## **When should I use GitHub?**

GitHub is a natural and efficient choice when you want to securely store code in the cloud as a long-term asset; when you need to collaborate with others and want the collaboration process to be recorded and traceable; or when you want to participate in open-source projects, learn from the community, and share your results.

In terms of usage, GitHub’s core logic is straightforward: you create a repository for a project, continuously make changes within it, and synchronize those changes with others when appropriate, or pull updates from them. In tools like Atoms, this workflow is further simplified. Users only need to complete authorization, create or connect a repository, and use intuitive Push and Pull actions to collaborate with GitHub, without needing to deeply understand the underlying technical details.

## **How does GitHub work in Atoms?**

In Atoms, GitHub acts as a trusted foundation for long-term storage and collaboration. Atoms is responsible for generating, modifying, and organizing code, while GitHub reliably stores the results and provides version history and collaboration capabilities. Together, they allow users to work in a way comparable to a professional development team, without needing to master complex engineering workflows.

When you start a project in Atoms, you can choose to connect it to GitHub. After completing authorization, you need to manually create a new repository in Atoms. From that point on, every important milestone of the project can be synchronized to GitHub, forming a clear and traceable history. This means that even if you switch devices, change tools, or pause the project for a period of time, your work remains intact, secure, and ready to continue.

In practice, you can think of Atoms as the “active workspace” and GitHub as the “final archive and collaboration hub.” You iterate on requirements, generate code, and fix issues in Atoms with the help of agents. Once a stage is stable, you push the results to GitHub. This approach avoids unnecessary interruptions from frequent syncing while ensuring that key milestones are safely preserved.

To enable GitHub integration, go to the workspace and click **Integrations** in the top-right corner, then enable GitHub from the dropdown. This will be reflected in the **Settings** panel. You can also enable GitHub directly from the **Settings** page. You will need to log in to your GitHub account and authorize Atoms to complete the connection.

Currently, the GitHub Connect feature is available only to Pro+ users.

GitHub also gives Atoms projects built-in collaboration potential. You can invite others to access your repository to review the project structure and implementation, or even contribute changes. This collaboration does not require others to use Atoms; it works through GitHub as a universal platform, enabling cross-tool and cross-role collaboration that is especially friendly for individual developers and small teams.

More importantly, by integrating with GitHub, Atoms projects are no longer one-off “generated outputs,” but long-term assets that can continuously evolve. Code can be reused, extended, reviewed, and maintained, and can be made public at the right time to join the broader open-source ecosystem. This extends the value of Atoms from “accelerating development today” to “building a sustainable foundation for future projects.”

## **User Stories**

In real-world usage, GitHub integration in Atoms often happens at the very beginning of a project. Take User A, a first-time Atoms user, as an example. He wanted the generated code to be saved directly to GitHub rather than remaining only in a local environment. After entering the Atoms workspace, he clicked **GitHub Connect** from the **Integrations** dropdown in the top-right corner and completed GitHub authorization in the **Settings** panel. Once authorization was complete, the GitHub module showed a connected status, indicating that Atoms could access his GitHub account.

Next, User A created a new repository directly in the chat. He entered a repository name that met GitHub’s requirements and confirmed the creation. He then continued generating and refining code in Atoms. When he felt the current stage was stable, he simply clicked **Push**, and the local code updates were synchronized to GitHub. Within seconds, he could see the corresponding commit on GitHub, clearly showing what changes were included.

At this point, User A continued working with the agent in Atoms to implement specific features. After completing the changes, he clicked **Push** again, and all updates were synchronized back to GitHub. Other team members could see the new commits almost immediately. By clicking **Pull**, User A could sync remote updates back to his local environment, ensuring it stayed aligned with the team’s progress.

These scenarios show how Atoms uses GitHub as a stable and universal collaboration foundation. Whether starting a brand-new project or working with an existing team repository, Atoms can integrate into established workflows without disruption, making generative development a sustainable and collaborative part of the software lifecycle.
