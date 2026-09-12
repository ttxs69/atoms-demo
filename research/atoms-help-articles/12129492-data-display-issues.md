# 12129492-data-display-issues

- Source: https://help.atoms.dev/en/articles/12129492-data-display-issues
- Summary: 
- Updated: 

---

Troubleshoot data visualization, chart rendering, and font display issues in Atoms.

## Fixing Chinese Character Display Issues in Data Analysis

If you are using `matplotlib` for data analysis, charts, or graph generation and notice Chinese characters rendering as missing blocks or boxes, add the following configuration line to set a supported CJK font:

```python
import matplotlib.pyplot as plt

# Set supported Chinese font for matplotlib
plt.rcParams['font.sans-serif'] = ['WenQuanYi Zen Hei']
plt.rcParams['axes.unicode_minus'] = False  # Resolve minus sign display issue
```

Instruct your Data Analyst agent (`@David`) to include this font setup in all data visualization scripts.

<AccordionGroup>
<Accordion title="Why can’t images be parsed?">
To work with images, you need to use multimodal models like Gemini-2.5-Pro Claude Sonnet, or GPT5.
</Accordion>
</AccordionGroup>
