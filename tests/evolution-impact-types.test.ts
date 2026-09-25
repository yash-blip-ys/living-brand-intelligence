import test from "node:test";
import assert from "node:assert/strict";

import {
  IMPACT_TYPES,
  toImpactType,
} from "@/lib/types/impact-types";

test("impact types are exactly the values the check constraint allows", () => {
  assert.deepEqual([...IMPACT_TYPES], [
    "audience",
    "positioning",
    "value_proposition",
    "differentiation",
    "personality",
    "naming",
    "tagline",
    "voice",
    "messaging",
    "visual_direction",
    "launch",
  ]);
});

test("every brand decision category maps to a storable impact type", () => {
  const categories = [
    "AUDIENCE",
    "POSITIONING",
    "VALUE_PROPOSITION",
    "DIFFERENTIATION",
    "PERSONALITY",
    "NAMING",
    "TAGLINE",
    "VOICE",
    "MESSAGING",
    "VISUAL_DIRECTION",
    "LAUNCH",
  ];
  for (const category of categories) {
    assert.equal(
      toImpactType(category),
      category.toLowerCase(),
      `${category} should be storable`,
    );
  }
});

test("drift classifications the analyst emits are not storable impact types", () => {
  // These are the vocabulary of the kind of drift, which the impact_type
  // column does not accept. Storing one of them failed every approval.
  for (const drift of [
    "scope_expansion",
    "scope_shift",
    "new_stakeholder",
    "tone_shift",
    "contradiction",
    "repositioning",
    "new_evidence",
    "misalignment",
    "opportunity",
    "risk",
    "audience_shift",
    "message_change",
    "other",
    "review",
  ]) {
    assert.equal(toImpactType(drift), null, `${drift} must not be storable`);
  }
});

test("mapping tolerates casing and separator variants only within the vocabulary", () => {
  assert.equal(toImpactType("  AUDIENCE "), "audience");
  assert.equal(toImpactType("Value Proposition"), "value_proposition");
  assert.equal(toImpactType("value-proposition"), "value_proposition");
  assert.equal(toImpactType("visual direction"), "visual_direction");
  // A near-miss is not silently coerced into a real category.
  assert.equal(toImpactType("audience_shift"), null);
  assert.equal(toImpactType("AUDIENCE_"), null);
  assert.equal(toImpactType(""), null);
  assert.equal(toImpactType(null), null);
  assert.equal(toImpactType(undefined), null);
  assert.equal(toImpactType(7), null);
});
