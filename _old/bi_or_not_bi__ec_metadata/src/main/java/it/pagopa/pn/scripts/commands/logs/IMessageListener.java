package it.pagopa.pn.scripts.commands.logs;

import java.util.function.Consumer;

@FunctionalInterface
public interface IMessageListener extends Consumer<Msg> {

}
