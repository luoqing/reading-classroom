const dimensions = [
  { key: 'accuracy', label: '读准确' },
  { key: 'natural', label: '读自然' },
  { key: 'delivery', label: '读到位' },
];

const scoreText = stars => Number.isFinite(stars) ? `${stars}颗星` : '待复核';

function dimensionComment(dimension, goal) {
  const detail = goal?.good || (Number.isFinite(goal?.stars) ? '已完成本项评测' : '这次需要结合回放再核实');
  return `${dimension.label}：${scoreText(goal?.stars)}，${detail}`;
}

function issueDimension(issue) {
  const labels = issue?.labels?.join('') || '';
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
  const candidates = (report?.issues || [])
    .map((issue, index) => ({ issue, index, dimension: issueDimension(issue) }))
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
  const keys = ['intro', ...dimensions.map(dimension =>
    `${dimension.key}-${spokenStar(report.goals[dimension.key]?.stars)}`)];
  const concreteIssue = selectPracticeIssue(report);
  if (!concreteIssue) return [...keys, 'all-clear'];
  return [...keys, `practice-${issueDimension(concreteIssue) || 'general'}`];
}

export function buildTeacherComment(report) {
  if (!report?.goals) return { text: '先夸夸你：愿意开口朗读，就是很棒的开始。', dimension: null };
  const scored = dimensions.map(dimension => ({ ...dimension, goal: report.goals[dimension.key] }));
  const summary = scored.map(dimension => dimensionComment(dimension, dimension.goal)).join('。');
  const concreteIssue = selectPracticeIssue(report);
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
  const practiceDetail = practice.replace(/^再练：/u, '');
  const practiceLabel = dimensions.find(item => item.key === dimension)?.label || '这一处';
  return {
    text: `先夸夸你：${praise}。${summary}。这次最值得再练的是${practiceLabel}：${practiceDetail}。小秋说完后，我们就听一听这句话里自己的回放，核实一下。`,
    dimension,
  };
}
