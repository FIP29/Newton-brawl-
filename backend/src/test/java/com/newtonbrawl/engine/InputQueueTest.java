package com.newtonbrawl.engine;

import com.newtonbrawl.engine.input.InputBits;
import com.newtonbrawl.engine.input.InputFrame;
import com.newtonbrawl.engine.input.InputQueue;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class InputQueueTest {

    @Test
    void oneInputPerTickWithEdgeDetection() {
        var q = new InputQueue();
        q.offer(1, InputBits.LIGHT);
        q.offer(2, 0); // released before the next tick: the tap must still register
        assertThat(q.next()).isEqualTo(new InputFrame(InputBits.LIGHT, InputBits.LIGHT));
        assertThat(q.lastAppliedSeq()).isEqualTo(1);
        assertThat(q.next()).isEqualTo(new InputFrame(0, 0));
        assertThat(q.lastAppliedSeq()).isEqualTo(2);
    }

    @Test
    void emptyQueueRepeatsHeldButtonsWithoutNewPresses() {
        var q = new InputQueue();
        q.offer(1, InputBits.RIGHT);
        q.next();
        assertThat(q.next()).isEqualTo(new InputFrame(InputBits.RIGHT, 0));
    }

    @Test
    void staleAndDuplicatePacketsAreIgnored() {
        var q = new InputQueue();
        q.offer(5, InputBits.LEFT);
        q.offer(5, InputBits.RIGHT);
        q.offer(3, InputBits.UP);
        assertThat(q.next().held()).isEqualTo(InputBits.LEFT);
        assertThat(q.next().held()).isEqualTo(InputBits.LEFT);
    }

    @Test
    void overflowDropsOldInputsButKeepsTheirPresses() {
        var q = new InputQueue();
        q.offer(1, InputBits.HEAVY);
        for (int s = 2; s <= 20; s++) q.offer(s, 0);
        InputFrame f = q.next();
        assertThat(f.wasPressed(InputBits.HEAVY)).isTrue();
    }

    @Test
    void unknownBitsAreMasked() {
        var q = new InputQueue();
        q.offer(1, 0xFFFF);
        assertThat(q.next().held()).isEqualTo(InputBits.ALL);
    }
}
