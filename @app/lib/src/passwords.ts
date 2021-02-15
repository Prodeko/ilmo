import { Store } from "rc-field-form/lib/interface";

const zxcvbn = import("zxcvbn").then(({ default: zxcvbn }) => zxcvbn);

interface ExpectedProps {
  setPasswordStrength: (score: number) => void;
  setPasswordSuggestions: (message: string[]) => void;
}

export const setPasswordInfo = async (
  props: ExpectedProps,
  changedValues: Store,
  fieldName = "password"
): Promise<void> => {
  // On field change check to see if password changed
  if (!(fieldName in changedValues)) {
    return;
  }

  const value = changedValues[fieldName];
  const z = await zxcvbn;
  const { score, feedback } = z(value || "");
  props.setPasswordStrength(score);

  const messages = [...feedback.suggestions];
  if (feedback.warning !== "") {
    messages.push(feedback.warning);
  }
  props.setPasswordSuggestions(messages);
};
