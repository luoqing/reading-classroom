const legacyDimensions = [
  { key: 'accuracy', label: '读准确' },
  { key: 'natural', label: '轻声字词' },
  { key: 'delivery', label: '多音字与变调' },
];

const twoDimensions = [
  { key: 'fluency', label: '读流利' },
  { key: 'correctness', label: '读准确' },
];

const dimensionsFor = report => report?.goals?.fluency && report?.goals?.correctness
  ? twoDimensions
  : legacyDimensions;

const scoreText = stars => Number.isFinite(stars) ? `${stars}颗星` : '待复核';

function dimensionComment(dimension, goal) {
  const detail = goal?.good || (Number.isFinite(goal?.stars) ? '已完成本项评测' : '这次需要结合回放再核实');
  return `${dimension.label}：${scoreText(goal?.stars)}，${detail}`;
}

function issueDimension(issue, report) {
  const labels = issue?.labels?.join('') || '';
  if (report?.goals?.fluency && report?.goals?.correctness) {
    return /停顿|断句|节奏/u.test(labels) ? 'fluency' : 'correctness';
  }
  if (/轻声/u.test(labels)) return 'natural';
  if (/声调|“一”/u.test(labels)) return 'delivery';
  if (/停顿|断句|节奏/u.test(labels)) return 'natural';
  if (/字音|漏读|增读|重复|替换/u.test(labels)) return 'accuracy';
  return null;
}

const spokenStar = stars => Number.isFinite(stars) && stars >= 1 && stars <= 3
  ? String(stars)
  : 'review';

const playable = issue => Number.isFinite(issue?.start)
  && Number.isFinite(issue?.end)
  && issue.end > issue.start;

export function selectPracticeIssue(report) {
  const dimensions = dimensionsFor(report);
  const candidates = (report?.issues || [])
    .map((issue, index) => ({ issue, index, dimension: issueDimension(issue, report) }))
    .filter(candidate => playable(candidate.issue));
  if (!candidates.length) return null;
  const dimensionOrder = new Map(dimensions.map((dimension, index) => [dimension.key, index]));
  candidates.sort((left, right) => {
    const leftStars = Number.isFinite(report?.goals?.[left.dimension]?.stars)
      ? report.goals[left.dimension].stars
      : 4;
    const rightStars = Number.isFinite(report?.goals?.[right.dimension]?.stars)
      ? report.goals[right.dimension].stars
      : 4;
    if (leftStars !== rightStars) return leftStars - rightStars;
    const leftOrder = dimensionOrder.get(left.dimension) ?? dimensions.length;
    const rightOrder = dimensionOrder.get(right.dimension) ?? dimensions.length;
    return leftOrder !== rightOrder ? leftOrder - rightOrder : left.index - right.index;
  });
  return candidates[0].issue;
}

export function buildTeacherSpeechKeys(report) {
  if (!report?.goals) return [];
  const dimensions = dimensionsFor(report);
  const keys = ['intro', ...dimensions.map(dimension =>
    `${dimension.key}-${spokenStar(report.goals[dimension.key]?.stars)}`)];
  const concreteIssue = selectPracticeIssue(report);
  if (!concreteIssue) return [...keys, 'all-clear'];
  return [...keys, `practice-${issueDimension(concreteIssue, report) || 'general'}`];
}

function twoDimensionComment(report) {
  const fluencyStars = report.goals.fluency?.stars;
  const correctnessStars = report.goals.correctness?.stars;
  const fluency = fluencyStars === 3
    ? '你有自然段意识，每段读得流利'
    : fluencyStars === 2
      ? '你知道自然段之间要停一停，大部分语句读得很流利'
      : '自然段之间停一停，把每段连起来读，会更流利';
  const correctness = correctnessStars === 3
    ? '重点字、轻声字和多音字词组都读准确'
    : correctnessStars === 2
      ? '大部分字词读音准，轻声字和多音字词组再听一听会更好'
      : '跟着示范再练重点字、轻声字和多音字词组';
  const concreteIssue = selectPracticeIssue(report);
  if (!concreteIssue) {
    return {
      text: `你敢于完整读出来，就是成功的第一步！${fluency}；${correctness}。真棒，优秀的小小配音员！`,
      dimension: null,
    };
  }
  const dimension = issueDimension(concreteIssue, report);
  const word = concreteIssue.word ? `“${concreteIssue.word}”这一处` : '这个小地方';
  return {
    text: `你敢于完整读出来，就是成功的第一步！${fluency}；${correctness}。再听听自己的${word}，读一遍，你会更棒！`,
    dimension,
  };
}

export function buildTeacherComment(report) {
  if (!report?.goals) return { text: '先夸夸你：愿意开口朗读，就是很棒的开始。', dimension: null };
  if (report.goals.fluency && report.goals.correctness) return twoDimensionComment(report);
  const dimensions = dimensionsFor(report);
  const scored = dimensions.map(dimension => ({ ...dimension, goal: report.goals[dimension.key] }));
  const summary = scored.map(dimension => dimensionComment(dimension, dimension.goal)).join('。');
  const concreteIssue = selectPracticeIssue(report);
  const dimension = issueDimension(concreteIssue, report);
  const praise = '愿意认真读完整篇课文，就是很棒的开始';
  if (!concreteIssue) {
    return {
      text: `先夸夸你：${praise}。${summary}。三个方面都没有发现明确问题，继续保持完整、自然的朗读。`,
      dimension: null,
    };
  }
  const practiceGoal = dimension ? report.goals[dimension] : null;
  const practice = practiceGoal?.practice || concreteIssue.labels?.[0] || '把这个小地方再读一遍';
  const practiceDetail = practice.replace(/^再练：/u, '');
  const practiceLabel = dimensions.find(item => item.key === dimension)?.label || '这一处';
  return {
    text: `先夸夸你：${praise}。${summary}。这次最值得再练的是${practiceLabel}：${practiceDetail}。小秋说完后，我们就听一听这句话里自己的回放，核实一下。`,
    dimension,
  };
}
