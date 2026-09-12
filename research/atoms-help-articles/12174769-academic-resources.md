# Access Academic Resources

- Source: https://help.atoms.dev/en/articles/12174769-academic-resources
- Summary: Research papers and academic resources behind Atoms’ multi-agent, reasoning, and workflow capabilities.
- Updated: Jul 29, 2026

---

Atoms collaborates with top universities and research institutes worldwide, producing cutting-edge research on multi-agent frameworks, LLM reasoning, context augmentation, and automated workflows.

These works not only push forward theoretical progress but also strengthen Atoms’ product capabilities in areas such as multi-agent collaboration, data interpretation, RAG-enhanced reasoning, and prompt optimization.

## **1\. You Don’t Know Until You Click: Automated GUI Testing for Production-Ready Software Evaluation**

**Abstract**

As large language models (LLMs) and code agents evolve from generating isolated snippets to building full applications with GUIs, interactive logic, and dynamic behaviors, current benchmarks fail to evaluate production-ready software effectively. Static checks or binary pass/fail scripts overlook real-world usability, which only emerges through interaction.

To address this, the authors introduce **RealDevWorld**, an end-to-end automated evaluation framework for testing LLMs’ ability to generate production-ready repositories from scratch.

**Key Contributions**

-   First GUI-based end-to-end evaluation framework for production-ready applications.
    
-   Introduced **RealDevBench**, a benchmark with 194 diverse multimodal engineering tasks.
    
-   Proposed **AppEvalPilot**, an agent-as-a-judge system simulating GUI-based user interactions for holistic assessment.
    
-   Achieved high human alignment (accuracy 0.92, correlation 0.85) while reducing reliance on manual review.
    

Read more: [https://arxiv.org/abs/2508.14104](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12174769%2F9bae721ee7f89114-2508.14104)

## **2\. Advances and Challenges in Foundation Agents: From Brain-Inspired Intelligence to Evolutionary, Collaborative, and Safe Systems**

**Abstract**

The advent of LLMs has catalyzed a transformative shift in AI, enabling intelligent agents capable of reasoning, perception, and action across domains. Designing, evaluating, and continuously improving such agents presents multifaceted challenges.

This survey provides a comprehensive overview of **Foundation Agents**, framed through brain-inspired modular architectures that integrate insights from cognitive science, neuroscience, and computation.

**Key Contributions**

-   Proposes a modular framework mapping agent components to brain functionalities (memory, modeling, goals, emotions).
    
-   Explores self-improvement and continual adaptation through evolutionary mechanisms.
    
-   Examines multi-agent systems and emergent collective intelligence.
    
-   Addresses safety, robustness, and alignment challenges in real-world deployment.
    

Read more: [https://arxiv.org/abs/2504.01990](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12174769%2F140c2173bc270f39-2504.01990)

## **3\. Atom of Thoughts for Markov LLM Test-Time Scaling**

**Abstract**

LLMs benefit from scaling during training, and **test-time scaling** further enhances reasoning. However, accumulated historical context can waste compute and hinder reasoning.

The paper introduces **Atom of Thoughts (AoT)**, which decomposes complex reasoning into **atomic, memoryless sub-questions**, forming a Markov-like reasoning process.

**Key Contributions**

-   Defines **atomic reasoning**: decomposing questions into DAG subproblems and contracting them.
    
-   Provides compatibility as a plug-in for existing test-time scaling methods.
    
-   Improves efficiency by reducing context redundancy and computational waste.
    
-   Demonstrates significant performance gains across six benchmarks.
    

Read more: [https://arxiv.org/abs/2502.12018](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12174769%2F0fe4f66233f76779-2502.12018)

## **4\. Self-Supervised Prompt Optimization (SPO)**

**Abstract**

High-quality prompts are crucial for enhancing LLM reasoning but manual prompt design requires expertise and iteration. Existing automated methods rely heavily on labeled references, limiting real-world applicability.

**SPO** introduces a self-supervised framework that discovers effective prompts for both closed- and open-ended tasks without external references.

**Key Contributions**

-   Self-supervised signals derived purely from LLM outputs.
    
-   Uses LLMs as both evaluator and optimizer.
    
-   Achieves state-of-the-art performance with **1–5% of the cost** of traditional methods.
    

Read more: [https://arxiv.org/abs/2502.06855](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12174769%2F3d753e3d8315715c-2502.06855)

## **5\. Improving Context Fidelity via Native Retrieval-Augmented Reasoning (CARE)**

**Abstract**

LLMs often hallucinate answers inconsistent with given context. Traditional solutions either require expensive supervised datasets or rely on external retrieval that underutilizes user-provided context.

**CARE** introduces a **native retrieval-augmented reasoning** framework where LLMs dynamically integrate in-context evidence directly into the reasoning chain.

**Key Contributions**

-   Introduces in-context retrieval as part of the reasoning process.
    
-   Requires minimal labeled data and uses curriculum learning for complex tasks.
    
-   Outperforms SFT, traditional RAG, and external retrieval methods on QA benchmarks.
    

Read more: [https://openreview.net/forum?id=qTsU1QLOph](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12174769%2F14aba8bacae33b91-forum)

## 6\. **FACT: Examining the Effectiveness of Iterative Context Rewriting for Multi-fact Retrieval**

**Abstract**

Large Language Models (LLMs) are strong at retrieving single facts from long contexts but struggle when multiple facts must be retrieved simultaneously. A key limitation observed is the **“lost-in-the-middle” phenomenon**, where LLMs gradually lose track of important information during generation, leading to incomplete or inaccurate outputs.

To address this, the authors propose **Find All Crucial Texts (FACT)** — an **iterative context rewriting method** that progressively refines the input, allowing the model to capture critical facts step by step.

**Key Contributions**

-   Identifies and analyzes the “lost-in-the-middle” phenomenon in multi-fact retrieval.
    
-   Introduces **FACT**, an iterative retrieval and rewriting approach that incrementally improves factual coverage.
    
-   Demonstrates significant performance gains in multi-fact retrieval benchmarks, though with smaller improvements on general QA tasks.
    
-   Highlights the need for more robust strategies in long-context retrieval.
    

Read more: [https://arxiv.org/abs/2410.21012](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12174769%2F5483011491700581-2410.21012)

## **7\. SELA: Tree-Search Enhanced LLM Agents for Automated Machine Learning**

**Abstract**

LLM-based AutoML agents often generate low-diversity and suboptimal pipelines. **SELA** leverages Monte Carlo Tree Search (MCTS) to optimize agent decision-making and pipeline exploration.

**Key Contributions**

-   Applies tree-search methods to improve AutoML exploration.
    
-   Iteratively refines pipelines with experimental feedback.
    
-   Outperforms traditional and agent-based AutoML baselines on 20 datasets.
    

Read more: [https://arxiv.org/abs/2410.17238](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12174769%2F89dbe78710ffc7b9-2410.17238)

## **8\. AFlow: Automating Agentic Workflow Generation**

**Abstract**

Constructing agentic workflows for LLMs is labor-intensive and not fully automated. **AFlow** reframes workflow optimization as a search problem over code graphs, using MCTS to iteratively refine workflows with execution feedback.

**Key Contributions**

-   Defines workflow optimization as code-graph search.
    
-   Enables smaller models to outperform GPT-4o at a fraction of the cost.
    
-   Achieves a **5.7% improvement** over state-of-the-art baselines.
    

Read more: [https://arxiv.org/abs/2410.10762](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12174769%2F9641fb4f7e4bbacc-2410.10762)

## **9\. Data Interpreter: An LLM Agent For Data Science**

**Abstract**

Existing approaches struggle with end-to-end data science workflows, dynamic task dependencies, and domain expertise requirements.

**Data Interpreter** introduces:

-   **Hierarchical Graph Modeling**: breaks down problems into subproblems with dynamic nodes.
    
-   **Programmable Node Generation**: iteratively refines and validates code for robustness.
    

**Key Contributions**

-   First LLM agent tailored for full data science workflows.
    
-   Achieves **25% accuracy improvement** on InfiAgent-DABench.
    
-   Boosts machine learning, open-ended tasks, and MATH dataset performance significantly.
    

Read more: [https://arxiv.org/abs/2402.18679](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12174769%2F8def13d0c408f6f1-2402.18679)

## **10\. MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework**

**Abstract**

LLM-based multi-agent systems often fail on complex tasks due to cascading hallucinations. **MetaGPT** encodes **Standard Operating Procedures (SOPs)** into prompt sequences, streamlining workflows and reducing errors.

**Key Contributions**

-   Introduces meta-programming for multi-agent collaboration.
    
-   Incorporates SOP-based human workflows into agent prompts.
    
-   Enables efficient role assignment and task decomposition.
    
-   Demonstrates superior stability and accuracy in collaborative software engineering tasks.
    

Read more: [https://arxiv.org/abs/2308.00352](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F12174769%2Fa269c568b98611fd-2308.00352)
