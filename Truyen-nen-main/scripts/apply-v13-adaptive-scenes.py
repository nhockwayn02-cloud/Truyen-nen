from pathlib import Path

root = Path(__file__).resolve().parents[1]
html = root / 'index.html'
s = html.read_text()

marker = 'async function generateChapter(regenIndex, regenMode, forceNsfw){'
assert marker in s
helper = r'''async function generateAdaptiveChapterText(o){
  const st = state;
  const limits = adaptiveChapterWordLimits(st);
  const recent = buildRecentBlocks(o.priorChapters || []).recentFullText;
  const planPrompt = buildAdaptiveScenePlanPrompt({
    state: st, context: o.context, recent,
    directive: st.directive, hint: st.nextChapterHint
  });
  let planRaw;
  try{
    const planRes = await callAI(planPrompt, {maxTokens:1800, temperature:0.35, modelOverride:o.model});
    planRaw = String(planRes && planRes.text || '');
  }catch(e){
    console.warn('[AdaptiveScene] plan failed', e && e.message);
    return null;
  }
  const graph = normalizeAdaptiveScenePlan(planRaw, st);
  if(!graph || !graph.scenes.length) return null;

  // Rebalance ngân sách mềm về khoảng 5.000 từ, không áp vai trò cố định cho scene.
  const rawSum = graph.scenes.reduce((n, x) => n + Math.max(1, Number(x.targetWords) || 1), 0);
  let remaining = limits.target;
  graph.scenes.forEach((scene, i) => {
    if(i === graph.scenes.length - 1) scene.targetWords = Math.max(350, remaining);
    else {
      scene.targetWords = Math.max(350, Math.round((scene.targetWords / rawSum) * limits.target / 50) * 50);
      remaining -= scene.targetWords;
    }
  });

  const pieces = [], sceneStates = [];
  let previousTail = o.priorChapters && o.priorChapters.length
    ? String(o.priorChapters[o.priorChapters.length - 1].text || '').slice(-900)
    : '';
  for(let i = 0; i < graph.scenes.length; i++){
    const scene = graph.scenes[i];
    if(countWords(pieces.join('\n\n')) >= limits.maxAccept) break;
    const prompt = buildAdaptiveSceneWritePrompt({
      state: st, scene, chapterGoal: graph.chapterGoal,
      endingAnchor: graph.endingAnchor, previousTail,
      stateDelta: sceneStates.length ? sceneStates[sceneStates.length - 1] : null,
      style: [
        DESCRIPTION_PROMPTS[st.descriptionLevel] || DESCRIPTION_PROMPTS.balanced,
        st.pronounRules ? ('XƯNG HÔ: ' + st.pronounRules) : '',
        o.usingNsfw ? (EROTIC_STYLE_PROMPT + '\nMỨC 18+: ' + (EXPLICIT_PROMPTS[st.explicitLevel] || '')) : ''
      ].filter(Boolean).join('\n')
    });
    try{
      const r = await callAI(prompt, {
        maxTokens: Math.min(3600, Math.max(1100, Math.ceil(scene.targetWords * 1.9))),
        temperature: o.usingNsfw ? 0.78 : 0.72,
        modelOverride: o.model,
        frequency_penalty: 0.22,
        presence_penalty: 0.18,
        streaming: false
      });
      let text = formatParagraphs(stripForeign(stripThinkingOutput(String(r && r.text || '')))).trim();
      if(detectNonVietnamese(text)) text = stripForeign(text);
      if(countWords(text) < 80) return null;
      pieces.push(text);
      previousTail = text.slice(-1200);
      sceneStates.push({
        sceneId: scene.id, location: scene.location, time: scene.time,
        characters: scene.characters, mustChange: scene.mustChange,
        handoff: scene.handoff, lastTail: previousTail
      });
    }catch(e){
      console.warn('[AdaptiveScene] scene failed', scene.id, e && e.message);
      return null;
    }
  }
  const text = pieces.join('\n\n').trim();
  const wc = countWords(text);
  if(wc < limits.minAccept) return {text, plan: 'ADAPTIVE SCENE GRAPH\n' + JSON.stringify(graph), underTarget:true};
  return {text, plan: 'ADAPTIVE SCENE GRAPH\n' + JSON.stringify(graph), underTarget:false};
}

'''
s = s.replace(marker, helper + marker, 1)

old = '''    let firstResult = await callAI(prompt, {
      maxTokens: 16000, temperature: 0.85, modelOverride: targetModel,
      frequency_penalty: usingNsfw ? 0.25 : 0.45,
      presence_penalty: usingNsfw ? 0.25 : 0.35,
      streaming: !!streamingTarget, onChunk: onChunk
    });
    let rawText = firstResult.text;
    let finishReason = firstResult.finishReason;'''
new = '''    let rawText = "", finishReason = null;
    let firstResult = null;
    if(!isRegen && state.adaptiveScenePipeline !== false){
      const adaptive = await generateAdaptiveChapterText({
        context, priorChapters, model: targetModel, usingNsfw
      });
      if(adaptive && adaptive.text){
        rawText = adaptive.text;
        plan = adaptive.plan;
        if(adaptive.underTarget) setStatus("⚠ Scene Graph tạo chương dưới 4.500 từ; giữ bản nháp để người dùng quyết định.", true);
      }
    }
    if(!rawText){
      firstResult = await callAI(prompt, {
        maxTokens: 7800, temperature: 0.85, modelOverride: targetModel,
        frequency_penalty: usingNsfw ? 0.25 : 0.45,
        presence_penalty: usingNsfw ? 0.25 : 0.35,
        streaming: !!streamingTarget, onChunk: onChunk
      });
      rawText = firstResult.text;
      finishReason = firstResult.finishReason;
    }'''
assert old in s
s = s.replace(old, new, 1)

s = s.replace('includeKeyOnExport: false, spellCheckEnabled: true,', 'includeKeyOnExport: false, spellCheckEnabled: false,')
s = s.replace('qualityGateEnabled: true, qualityAcceptSoft: false, requiredBeatBarrier: true, qualityPassScore: 90, qualitySoftFailScore: 75, qualityMaxAttempts: 5, autoRepairOnCreate: true', 'qualityGateEnabled: true, qualityAcceptSoft: false, requiredBeatBarrier: true, qualityPassScore: 90, qualitySoftFailScore: 75, qualityMaxAttempts: 2, autoRepairOnCreate: true, adaptiveScenePipeline: true, semanticProseAuto: false')
s = s.replace('if(!state.autoContinueEnabled) return chapterObj;', 'if(!state.autoContinueEnabled || state.adaptiveScenePipeline !== false) return chapterObj;', 1)
s = s.replace('  try{\n    setStatus("🔎 Semantic Prose Check: rà câu chữ theo ngữ cảnh...", true);', '  if(state.semanticProseAuto === true){\n  try{\n    setStatus("🔎 Semantic Prose Check: rà câu chữ theo ngữ cảnh...", true);', 1)
s = s.replace('  }catch(e){ chapterObj.autoUpdateIssues = (chapterObj.autoUpdateIssues || []).concat(["Semantic Prose Check không hoàn tất: " + (e.message || e)]); }\n  // V12.23: báo rõ lý do dừng', '  }catch(e){ chapterObj.autoUpdateIssues = (chapterObj.autoUpdateIssues || []).concat(["Semantic Prose Check không hoàn tất: " + (e.message || e)]); }\n  }\n  // V12.23: báo rõ lý do dừng', 1)

html.write_text(s)
