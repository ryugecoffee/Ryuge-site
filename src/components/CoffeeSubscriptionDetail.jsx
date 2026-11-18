import { useState } from "react";
import { COFFEE_SUBSCRIPTION as SUB, SUBSCRIPTIONS_PAUSED, SUBSCRIPTIONS_PAUSED_TEXT, loc, subscriptionFrequency } from "../productData";
import { PREFERENCE_ISSUE_TEXT, PREFERENCE_MAX_LENGTH, normalizePreference, preferenceIssues } from "../lib/subscriptionPreference";

const yen = (n) => `¥${Number(n).toLocaleString("ja-JP")}`;

// 珈琲の定期便: choose deliveries per month and see the monthly price and amount; leave a coffee preference.
// All wording comes from COFFEE_SUBSCRIPTION (src/productData.js). Signing up stays closed: the button is disabled while
// SUBSCRIPTIONS_PAUSED, and also afterwards until checkout is wired to this subscription (api/create-subscription-
// checkout.js still knows only the old plans). Changing deliveries, skipping and cancelling are shown as information,
// not as working buttons.
export default function CoffeeSubscriptionDetail({ lang }) {
  const [frequencyId, setFrequencyId] = useState(SUB.defaultFrequency);
  const [preference, setPreference] = useState("");
  const selected = subscriptionFrequency(frequencyId);
  const labels = SUB.labels[lang] || SUB.labels.ja;
  const frequencyName = SUB.frequencyLabel[lang] || SUB.frequencyLabel.ja;
  const issueText = PREFERENCE_ISSUE_TEXT[lang] || PREFERENCE_ISSUE_TEXT.ja;
  const issues = preferenceIssues(preference);
  const length = [...normalizePreference(preference)].length;
  const closedText = SUBSCRIPTIONS_PAUSED ? loc(SUBSCRIPTIONS_PAUSED_TEXT, lang) : loc(SUB.manage.unavailable, lang);
  const list = (value) => value?.[lang] || value?.ja || [];

  return (
    <div className="modal-copy-inner subscription-modal-copy coffee-sub">
      <h3>{loc(SUB.name, lang)}</h3>
      <p className="modal-summary">{loc(SUB.lead, lang)}</p>

      <fieldset className="coffee-sub-frequency">
        <legend>{labels.frequency}</legend>
        <div className="coffee-sub-frequency-options" role="radiogroup" aria-label={labels.frequency}>
          {SUB.frequencies.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={option.id === selected.id}
              className={`coffee-sub-frequency-option ${option.id === selected.id ? "active" : ""}`}
              onClick={() => setFrequencyId(option.id)}
            >
              <span>{frequencyName(option.deliveriesPerMonth)}</span>
              <small>{yen(option.priceNumber)}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <dl className="coffee-sub-summary" aria-live="polite">
        <div>
          <dt>{labels.monthly}</dt>
          <dd>
            <strong>{yen(selected.priceNumber)}</strong>
            <span>{labels.perMonth}</span>
            <small>{labels.priceNote}</small>
          </dd>
        </div>
        <div>
          <dt>{labels.amount}</dt>
          <dd><strong>{selected.gramsPerMonth}g</strong><small>{frequencyName(selected.deliveriesPerMonth)}</small></dd>
        </div>
        <div>
          <dt>{labels.perDelivery}</dt>
          <dd>{loc(SUB.perDelivery, lang)}</dd>
        </div>
      </dl>

      <p className="coffee-sub-note">{loc(SUB.selectionNote, lang)}</p>
      <ul className="coffee-sub-terms">
        {list(SUB.terms).map((term) => <li key={term}>{term}</li>)}
      </ul>
      <p className="coffee-sub-pending">{loc(SUB.pendingNote, lang)}</p>

      <div className="coffee-sub-preference">
        <label htmlFor="coffee-sub-preference-input">{loc(SUB.preference.label, lang)}</label>
        <textarea
          id="coffee-sub-preference-input"
          rows={4}
          maxLength={PREFERENCE_MAX_LENGTH}
          placeholder={loc(SUB.preference.placeholder, lang)}
          value={preference}
          disabled={SUBSCRIPTIONS_PAUSED}
          onChange={(event) => setPreference(event.target.value)}
        />
        <div className="coffee-sub-preference-count">{length} / {PREFERENCE_MAX_LENGTH}</div>
        {issues.map((code) => <p key={code} role="alert" className="coffee-sub-preference-issue">{issueText[code]}</p>)}
        <ul className="coffee-sub-preference-notes">
          {list(SUB.preference.notes).map((note) => <li key={note}>{note}</li>)}
        </ul>
      </div>

      <p className="product-detail-notice coffee-sub-closed">{closedText}</p>
      <button type="button" className="modal-cta-link is-disabled" disabled>{closedText}</button>

      <section className="coffee-sub-manage" aria-label={loc(SUB.manage.title, lang)}>
        <h4>{loc(SUB.manage.title, lang)}</h4>
        <ul>
          {list(SUB.manage.items).map((item) => (
            <li key={item}><span>{item}</span><small>{loc(SUB.manage.unavailable, lang)}</small></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
