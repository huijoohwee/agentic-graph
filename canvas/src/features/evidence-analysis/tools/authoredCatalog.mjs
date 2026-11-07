import aviation from '../profiles/aviation-v1.json' with { type: 'json' };
import volume from '../profiles/volume-v1.json' with { type: 'json' };
import arrival from '../profiles/arrival-v1.json' with { type: 'json' };
import route from '../profiles/route-v1.json' with { type: 'json' };
import volumeView from '../profiles/volume-view.json' with { type: 'json' };
import arrivalPolicy from '../profiles/arrival-policy.json' with { type: 'json' };
import routePolicy from '../profiles/route-policy.json' with { type: 'json' };
import noticePolicy from '../profiles/notice-policy.json' with { type: 'json' };

// This catalog is reached through the lazy feature boundary. Static imports let
// Vite transform JSON to JavaScript while Node keeps its required JSON attributes.
const authored = Object.freeze({
  'aviation-v1': aviation, 'volume-v1': volume, 'arrival-v1': arrival, 'route-v1': route,
  'volume-view': volumeView, 'arrival-policy': arrivalPolicy, 'route-policy': routePolicy, 'notice-policy': noticePolicy,
});
export async function readAuthoredEvidenceConfig(id) {
  if (typeof id !== 'string' || !Object.hasOwn(authored, id)) {
    const error = new Error('Select an explicitly registered authored profile or policy.');
    error.code = 'CONFIG'; error.path = 'configId'; throw error;
  }
  return JSON.parse(JSON.stringify(authored[id]));
}
