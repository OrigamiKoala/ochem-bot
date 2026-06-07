// ------ Queue Cache (localStorage) ------

export function getQueueCacheKey(isFreeDraw, isGenChemMode) {
  if (isFreeDraw) return 'freedraw_reaction_queue';
  return isGenChemMode ? 'genchem_reaction_queue' : 'ochem_reaction_queue';
}

export function saveQueueToCache(currentReaction, reactionQueue, isFreeDraw, isGenChemMode) {
  try {
    const key = getQueueCacheKey(isFreeDraw, isGenChemMode);
    const queueToSave = currentReaction ? [currentReaction, ...reactionQueue] : reactionQueue;
    localStorage.setItem(key, JSON.stringify(queueToSave));
  } catch (e) {
    console.warn('Failed to save queue to cache:', e);
  }
}

export function loadQueueFromCache(isFreeDraw, isGenChemMode) {
  try {
    const key = getQueueCacheKey(isFreeDraw, isGenChemMode);
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Flatten out any AI-hallucinated nested {reactions: [...]} objects that got cached
        let flattenedQueue = [];
        parsed.forEach(item => {
          if (item && Array.isArray(item.reactions)) {
            flattenedQueue = flattenedQueue.concat(item.reactions);
          } else if (item && (item.qtype || item.reactants || item.answer || item.instructions)) {
            flattenedQueue.push(item);
          }
        });

        if (flattenedQueue.length === 0) {
          localStorage.removeItem(key);
          return [];
        }

        return flattenedQueue;
      }
    }
  } catch (e) {
    console.warn('Failed to load queue from cache:', e);
  }
  return [];
}

// Topic / settings keys
export function getSelectedTopicsKey(isGenChemMode) {
  return isGenChemMode ? 'genchem_selected_topics' : 'ochem_selected_topics';
}

export function getCustomTopicsKey(isGenChemMode) {
  return isGenChemMode ? 'genchem_custom_topics' : 'ochem_custom_topics';
}

// Migration helper — runs once
export function migrateModeFlags() {
  if (!localStorage.getItem('ochem_practice_mode')) {
    if (localStorage.getItem('ochem_freedraw_mode') === 'true') {
      localStorage.setItem('ochem_practice_mode', 'freedraw');
    } else if (localStorage.getItem('ochem_genchem_mode') === 'true') {
      localStorage.setItem('ochem_practice_mode', 'all');
    } else {
      localStorage.setItem('ochem_practice_mode', 'organic');
    }
  }
}
