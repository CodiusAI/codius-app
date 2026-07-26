typeset -g CODIUS_SHELL_INTEGRATION_DIR="${${(%):-%N}:A:h}"

if [[ -n "${CODIUS_ZSH_ZDOTDIR-}" ]]; then
  export ZDOTDIR="${CODIUS_ZSH_ZDOTDIR}"
else
  unset ZDOTDIR
fi

if [[ -n "${ZDOTDIR-}" ]]; then
  if [[ -f "${ZDOTDIR}/.zshenv" ]]; then
    source "${ZDOTDIR}/.zshenv"
  fi
elif [[ -f "${HOME}/.zshenv" ]]; then
  source "${HOME}/.zshenv"
fi

source "${CODIUS_SHELL_INTEGRATION_DIR}/codius-integration.zsh"
