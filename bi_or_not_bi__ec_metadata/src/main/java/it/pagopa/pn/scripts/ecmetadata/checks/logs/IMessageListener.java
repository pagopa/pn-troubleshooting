package it.pagopa.pn.scripts.ecmetadata.checks.logs;

import it.pagopa.pn.scripts.ecmetadata.checks.logs.Msg;

import java.util.function.Consumer;

@FunctionalInterface
public interface IMessageListener extends Consumer<Msg> {

}
