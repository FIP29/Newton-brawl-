package com.newtonbrawl.engine.fighter;

/**
 * A playable fighter: its data definition plus behaviour hooks for mechanics that can't be
 * expressed as frame data (specials, ultimates, passive effects). One subclass per scientist.
 *
 * <p>Phase 2 only needs the shared light/heavy attacks; hooks are added as fighters gain specials.
 */
public abstract class Fighter {

    private final FighterDefinition definition;

    protected Fighter(FighterDefinition definition) {
        this.definition = definition;
    }

    public FighterDefinition definition() {
        return definition;
    }

    public String id() {
        return definition.id();
    }
}
