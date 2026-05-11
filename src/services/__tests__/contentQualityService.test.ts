import { describe, it, expect } from 'vitest';
import { evaluateContentQuality } from '../contentQualityService';

const GOOD_TOOL_CONTENT = `
<p>Linear is a project management tool built for software teams who want speed without ceremony. Pricing starts at $8/seat/month for the Standard plan, with a free tier covering up to 250 issues. In our review, we tested it across two teams of 5-12 engineers over six weeks.</p>

<h2>What Linear does well</h2>
<p>The keyboard-first design is the standout. Almost every action — creating issues, switching projects, assigning teammates — has a shortcut. After using it for a week, our team reported a 40% drop in time spent on issue triage compared to Jira.</p>

<h2>Where it falls short</h2>
<p>Linear has limitations worth knowing about. Custom workflows are constrained compared to Jira; you cannot build deeply branched approval processes. Reporting is also lighter than Asana's, which matters if executives expect rolled-up dashboards.</p>

<h2>How Linear compares to Jira</h2>
<p>Compared to Jira, Linear is roughly 3x faster to navigate but covers maybe 60% of the configurability. For startups under 50 engineers, that trade-off is usually worth it. For enterprise teams with compliance workflows, Jira still wins on flexibility.</p>

<h2>Pricing breakdown</h2>
<ul>
  <li>Free: up to 250 issues, unlimited members</li>
  <li>Standard: $8/seat/month, unlimited issues</li>
  <li>Plus: $14/seat/month, advanced workflows</li>
</ul>

<h2>Who should pick Linear</h2>
<p>Linear is the right choice for product-led startups where speed matters more than process. Pick something else if your team needs custom approval flows or detailed time-tracking. We've used it ourselves since 2024 and it remains our default recommendation for teams under 100.</p>
`;

const POOR_TOOL_CONTENT =
  '<p>This revolutionary tool is a game-changer in today\'s fast-paced world. It is cutting-edge.</p>';

describe('evaluateContentQuality', () => {
  it('rates a well-structured tool review as good or excellent', async () => {
    const result = await evaluateContentQuality(GOOD_TOOL_CONTENT, 'tool', {
      primaryKeyword: 'Linear',
      toolName: 'Linear',
    });
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(['good', 'excellent']).toContain(result.status);
    expect(result.metrics.wordCount).toBeGreaterThan(200);
    expect(result.metrics.eeatScore).toBeGreaterThan(70);
  });

  it('flags hype words and short content as poor', async () => {
    const result = await evaluateContentQuality(POOR_TOOL_CONTENT, 'tool');
    expect(result.score).toBeLessThan(50);
    expect(result.status).toBe('poor');
    expect(result.issues.some((i) => /hype words/i.test(i))).toBe(true);
    expect(result.issues.some((i) => /word count|minimum/i.test(i))).toBe(true);
  });

  it('detects missing primary keyword', async () => {
    const content = '<p>'.concat('A tool that does things. '.repeat(200), '</p>');
    const result = await evaluateContentQuality(content, 'tool', {
      primaryKeyword: 'Notion',
    });
    expect(result.issues.some((i) => /Notion/.test(i))).toBe(true);
  });

  it('penalises invalid heading hierarchy', async () => {
    const content =
      '<h3>Subsection</h3><p>' + 'Some text here for filler. '.repeat(150) + '</p><h2>Section</h2>';
    const result = await evaluateContentQuality(content, 'tool', { toolName: 'X' });
    expect(result.issues.some((i) => /H3.*H2/i.test(i))).toBe(true);
  });

  it('returns the expected shape', async () => {
    const result = await evaluateContentQuality(GOOD_TOOL_CONTENT, 'tool');
    expect(result).toMatchObject({
      score: expect.any(Number),
      status: expect.stringMatching(/excellent|good|fair|poor/),
      issues: expect.any(Array),
      suggestions: expect.any(Array),
      metrics: {
        wordCount: expect.any(Number),
        readabilityScore: expect.any(Number),
        seoScore: expect.any(Number),
        eeatScore: expect.any(Number),
        structureScore: expect.any(Number),
      },
    });
  });

  it('caps scores within 0-100 for every metric', async () => {
    const result = await evaluateContentQuality(GOOD_TOOL_CONTENT, 'tool');
    for (const v of [
      result.score,
      result.metrics.readabilityScore,
      result.metrics.seoScore,
      result.metrics.eeatScore,
      result.metrics.structureScore,
    ]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
