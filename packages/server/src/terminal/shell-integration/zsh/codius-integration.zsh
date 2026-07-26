if [[ -n "${_CODIUS_ZSH_INTEGRATION_LOADED-}" ]]; then
  return
fi
typeset -g _CODIUS_ZSH_INTEGRATION_LOADED=1

autoload -Uz add-zsh-hook

typeset -g _CODIUS_ZSH_COMMAND_ACTIVE=0

function _codius_osc633() {
  printf '\e]633;%s\a' "$1"
}

function _codius_precmd() {
  local command_status=$?
  if [[ "$_CODIUS_ZSH_COMMAND_ACTIVE" == "1" ]]; then
    _codius_osc633 "D;${command_status}"
    _CODIUS_ZSH_COMMAND_ACTIVE=0
  fi
  printf '\e]2;%s\a' "${PWD/#$HOME/~}"
  _codius_osc633 "A"
}

function _codius_preexec() {
  _CODIUS_ZSH_COMMAND_ACTIVE=1
  _codius_osc633 "B"
  _codius_osc633 "C"
  printf '\e]2;%s\a' "$1"
}

add-zsh-hook precmd _codius_precmd
add-zsh-hook preexec _codius_preexec
