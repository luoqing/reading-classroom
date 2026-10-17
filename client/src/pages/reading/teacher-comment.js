const dimensions = [
  { key: 'accuracy', label: '读准确' },
  { key: 'natural', label: '读自然' },
  { key: 'delivery', label: '读到位' },
];

const scoreText = stars => Number.isFinite(stars) ? `${stars}颗星` : '待复核';

const feedbackByDimension = {
  accuracy: {
    1: '放慢一点，把每个字音读清楚',
    2: '大部分字音读准了，还有一个小地方可以再听一听',
    3: '字音整体读得很清楚',
    review: '这次需要结合回放再核实字音',
  },
  natural: {
    1: '注意在标点处停一停，句子中间连起来',
    2: '大部分断句合适，节奏还可以更连贯',
    3: '断句和节奏都很自然',
    review: '这次需要结合回放再核实断句和节奏',
  },
  delivery: {
    1: '再留意“一”的变调和“了”的轻声',
    2: '大部分变调和轻声读对了，再练一个小地方',
    3: '“一”的变调和“了”的轻声都读得很到位',
    review: '这次需要结合回放再核实轻声和变调',
  },
};

function dimensionComment(dimension, goal) {
  const detail = feedbackByDimension[dimension.key][Number.isFinite(goal?.stars) ? goal.stars : 'review'];
  return `${dimension.label}：${scoreText(goal?.stars)}，${detail}`;
}

function issueDimension(issue) {
  const labels = issue?.labels?.join('') || '';
  if (/声调|轻声|“一”/u.test(labels)) return 'delivery';
  if (/停顿|断句|节奏/u.test(labels)) return 'natural';
  if (/字音|漏读|增读|重复|替换/u.test(labels)) return 'accuracy';
  return null;
}

const spokenStar = stars => Number.isFinite(stars) && stars >= 1 && stars <= 3
  ? String(stars)
  : 'review';

export function buildTeacherSpeechKeys(report) {
  if (!report?.goals) return [];
  const keys = ['intro', ...dimensions.map(dimension =>
    `${dimension.key}-${spokenStar(report.goals[dimension.key]?.stars)}`)];
  const concreteIssue = report.issues?.find(issue =>
    Number.isFinite(issue.start) && Number.isFinite(issue.end) && issue.end > issue.start);
  if (!concreteIssue) return [...keys, 'all-clear'];
  return [...keys, `practice-${issueDimension(concreteIssue) || 'general'}`];
}

export function buildTeacherComment(report) {
  if (!report?.goals) return { text: '先夸夸你：愿意开口朗读，就是很棒的开始。', dimension: null };
  const scored = dimensions.map(dimension => ({ ...dimension, goal: report.goals[dimension.key] }));
  const summary = scored.map(dimension => dimensionComment(dimension, dimension.goal)).join('。');
  const concreteIssue = report.issues?.find(issue => Number.isFinite(issue.start) && Number.isFinite(issue.end) && issue.end > issue.start);
  const dimension = issueDimension(concreteIssue);
  const praise = '愿意认真读完整篇课文，就是很棒的开始';
  if (!concreteIssue) {
    return {
      text: `先夸夸你：${praise}。${summary}。三个方面都没有发现明确问题，继续保持完整、自然的朗读。`,
      dimension: null,
    };
  }
  const practiceGoal = dimension ? report.goals[dimension] : null;
  const practice = practiceGoal?.practice || concreteIssue.labels?.[0] || '把这个小地方再读一遍';
  const practiceLabel = dimensions.find(item => item.key === dimension)?.label || '这一处';
  return {
    text: `先夸夸你：${praise}。${summary}。这次最值得再练的是${practiceLabel}：${practice}。小秋说完后，我们就听一听这句话里自己的回放，核实一下。`,
    dimension,
  };
}
